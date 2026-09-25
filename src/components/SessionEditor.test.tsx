import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SessionEditor, type SessionEditorProps } from './SessionEditor';

const noop = () => {};

function setup(props: Partial<SessionEditorProps> = {}) {
  const user = userEvent.setup();
  const onSubmit = vi.fn<SessionEditorProps['onSubmit']>().mockResolvedValue(undefined);
  render(
    <SessionEditor
      recorded={null}
      nightDate="2026-09-25"
      maxNightDate="2026-09-26"
      onSubmit={onSubmit}
      onCancel={noop}
      {...props}
    />,
  );
  const type = async (label: 'Bedtime' | 'Wake-up', value: string) => {
    const field = screen.getByRole('textbox', { name: label });
    await user.clear(field);
    await user.type(field, `${value}{Enter}`);
  };
  const endpoint = (name: 'Went to bed' | 'Got up') => within(screen.getByRole('group', { name }));
  return { user, onSubmit, type, endpoint };
}

describe('SessionEditor: new past night', () => {
  it('starts empty, requires both endpoints and derives an evening-before bedtime', async () => {
    const { user, onSubmit, type, endpoint } = setup({ requireWake: true });
    expect(screen.getByRole('textbox', { name: 'Bedtime' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Wake-up' })).toHaveValue('');
    expect(endpoint('Went to bed').getByText('Not recorded')).toBeInTheDocument();
    expect(endpoint('Got up').getByText('Not recorded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save night' })).toBeDisabled();

    await type('Bedtime', '23:35');
    expect(screen.getByText('Add the wake-up time to save this night.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save night' })).toBeDisabled();
    await type('Wake-up', '07:10');
    expect(endpoint('Went to bed').getByText('Not saved yet')).toBeInTheDocument();
    expect(screen.getByText('7 h 35 min')).toBeInTheDocument();
    expect(screen.getByText(/Thu 24 Sep/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save night' }));
    expect(onSubmit).toHaveBeenCalledWith({
      nightDate: '2026-09-25',
      bedtime: '2026-09-24T23:35',
      wakeTime: '2026-09-25T07:10',
    });
  });

  it('places an after-midnight bedtime on the night date', async () => {
    const { user, onSubmit, type } = setup({ requireWake: true });
    await type('Wake-up', '07:00');
    await type('Bedtime', '01:30');
    expect(screen.getByText('5 h 30 min')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save night' }));
    expect(onSubmit).toHaveBeenCalledWith({
      nightDate: '2026-09-25',
      bedtime: '2026-09-25T01:30',
      wakeTime: '2026-09-25T07:00',
    });
  });

  it('starts empty steppers from a typical time instead of an arbitrary one', async () => {
    const { user } = setup({ requireWake: true });
    await user.click(screen.getByRole('button', { name: 'Bedtime 5 minutes later' }));
    expect(screen.getByRole('textbox', { name: 'Bedtime' })).toHaveValue('22:00');
  });
});

describe('SessionEditor: current night', () => {
  it('saves a suggested bedtime alone as an in-progress night', async () => {
    const { user, onSubmit, endpoint } = setup({ suggest: { bedtime: '2026-09-24T22:40' }, nightDateEditable: false });
    expect(endpoint('Went to bed').getByText('Suggested · not saved')).toBeInTheDocument();
    expect(endpoint('Got up').getByText('Not recorded')).toBeInTheDocument();
    expect(screen.getByText(/Saved as in progress/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Night ending')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save night' }));
    expect(onSubmit).toHaveBeenCalledWith({ nightDate: '2026-09-25', bedtime: '2026-09-24T22:40', wakeTime: null });
  });

  it('re-derives the bedtime date when the suggested clock moves past midnight', async () => {
    const { user, onSubmit, type } = setup({ suggest: { bedtime: '2026-09-24T23:50' } });
    await type('Bedtime', '00:20');
    await user.click(screen.getByRole('button', { name: 'Save night' }));
    expect(onSubmit).toHaveBeenCalledWith({ nightDate: '2026-09-25', bedtime: '2026-09-25T00:20', wakeTime: null });
  });

  it('requires a bedtime before a morning wake-up can be saved', async () => {
    const { user, onSubmit, type, endpoint } = setup({ suggest: { wakeTime: '2026-09-25T07:05' } });
    expect(endpoint('Got up').getByText('Suggested · not saved')).toBeInTheDocument();
    expect(screen.getByText('Add the bedtime to save this night.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save night' })).toBeDisabled();
    await type('Bedtime', '23:30');
    await user.click(screen.getByRole('button', { name: 'Save night' }));
    expect(onSubmit).toHaveBeenCalledWith({
      nightDate: '2026-09-25',
      bedtime: '2026-09-24T23:30',
      wakeTime: '2026-09-25T07:05',
    });
  });

  it('completes a recorded bedtime without touching it', async () => {
    const recorded = { nightDate: '2026-09-25', bedtime: '2026-09-25T00:40', wakeTime: null };
    const { user, onSubmit, endpoint } = setup({ recorded, suggest: { wakeTime: '2026-09-25T07:15' } });
    expect(endpoint('Went to bed').getByText('Recorded')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Bedtime' })).toHaveValue('00:40');
    expect(screen.getByText('6 h 35 min')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith({ ...recorded, wakeTime: '2026-09-25T07:15' });
  });
});

describe('SessionEditor: existing records', () => {
  it('never moves a stored bedtime date when only the other endpoint changes', async () => {
    // Stored 24 Sep 01:00 would be inferred as 25 Sep 01:00; the stored fact wins and is flagged.
    const recorded = { nightDate: '2026-09-25', bedtime: '2026-09-24T01:00', wakeTime: null };
    const { user, onSubmit, type } = setup({ recorded });
    await type('Wake-up', '07:00');
    expect(screen.getByText(/very long time in bed/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save anyway' }));
    expect(onSubmit).toHaveBeenCalledWith({ ...recorded, wakeTime: '2026-09-25T07:00' });
  });

  it('blocks impossible combinations', async () => {
    const recorded = { nightDate: '2026-09-25', bedtime: '2026-09-25T00:40', wakeTime: '2026-09-25T08:15' };
    const { type } = setup({ recorded });
    await type('Wake-up', '00:30');
    expect(screen.getByText('Wake-up must be after bedtime.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('removes one endpoint distinctly from deleting the night', async () => {
    const onDelete = vi.fn();
    const recorded = { nightDate: '2026-09-25', bedtime: '2026-09-24T23:00', wakeTime: '2026-09-25T07:00' };
    const { user, onSubmit, endpoint } = setup({ recorded, onDelete });
    expect(endpoint('Went to bed').queryByRole('button', { name: /^(Remove|Clear) bedtime/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove wake-up' }));
    expect(endpoint('Got up').getByText('Will be removed')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith({ ...recorded, wakeTime: null });
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Delete night' })).toBeInTheDocument();
  });

  it('keeps a legacy wake-only record inspectable and repairable', async () => {
    const recorded = { nightDate: '2026-09-25', bedtime: null, wakeTime: '2026-09-25T07:10' };
    const { user, onSubmit, type, endpoint } = setup({ recorded, onDelete: noop });
    expect(endpoint('Got up').getByText('Recorded')).toBeInTheDocument();
    expect(endpoint('Went to bed').getByText('Not recorded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await type('Bedtime', '22:50');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith({ ...recorded, bedtime: '2026-09-24T22:50' });
  });

  it('keeps unusual bedtime dates reachable, with a warning instead of a rejection', async () => {
    const { user, onSubmit, type } = setup({ suggest: { bedtime: '2026-09-24T23:00' } });
    expect(screen.queryByLabelText('Bedtime date', { selector: 'input' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Change bedtime date' }));
    const date = screen.getByLabelText('Bedtime date', { selector: 'input' });
    expect(date).toHaveValue('2026-09-24');
    fireEvent.change(date, { target: { value: '2026-09-20' } });
    expect(screen.getByText(/more than a day before the night ends/)).toBeInTheDocument();
    // A hand-picked date survives edits to the clock.
    await type('Bedtime', '21:15');
    await user.click(screen.getByRole('button', { name: 'Save anyway' }));
    expect(onSubmit).toHaveBeenCalledWith({ nightDate: '2026-09-25', bedtime: '2026-09-20T21:15', wakeTime: null });
  });

  it('shows server errors and locks the form while saving', async () => {
    let fail!: (error: Error) => void;
    const onSubmit = vi.fn(() => new Promise<void>((_, reject) => (fail = reject)));
    const { user } = setup({ suggest: { bedtime: '2026-09-24T23:00' }, onSubmit, person: <p>Sam’s night</p> });
    await user.click(screen.getByRole('button', { name: 'Save night' }));
    expect(screen.getByRole('textbox', { name: 'Bedtime' })).toBeDisabled();
    expect(screen.getByLabelText('Night ending')).toBeDisabled();
    fail(new Error('Sam already has a record for that night.'));
    expect(await screen.findByText('Sam already has a record for that night.')).toBeInTheDocument();
  });
});
