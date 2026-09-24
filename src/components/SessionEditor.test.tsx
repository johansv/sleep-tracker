import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SessionEditor } from './SessionEditor';

const noop = () => {};

describe('SessionEditor', () => {
  it('previews wall-clock time in bed and submits local date-times', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <SessionEditor
        isNew
        initial={{ nightDate: '2026-09-25', bedtime: null, wakeTime: null }}
        maxNightDate="2026-09-26"
        onSubmit={onSubmit}
        onCancel={noop}
      />,
    );
    // Defaults: 23:00 the evening before → 07:00.
    expect(screen.getByText('8 h')).toBeInTheDocument();
    const bed = screen.getByRole('textbox', { name: 'Bedtime' });
    await user.clear(bed);
    await user.type(bed, '23:35{Enter}');
    const wake = screen.getByRole('textbox', { name: 'Wake-up' });
    await user.clear(wake);
    await user.type(wake, '07:10{Enter}');
    expect(screen.getByText('7 h 35 min')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save night' }));
    expect(onSubmit).toHaveBeenCalledWith({
      nightDate: '2026-09-25',
      bedtime: '2026-09-24T23:35',
      wakeTime: '2026-09-25T07:10',
    });
  });

  it('supports after-midnight bedtimes on the night date', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <SessionEditor
        isNew={false}
        initial={{ nightDate: '2026-09-25', bedtime: '2026-09-25T00:40', wakeTime: '2026-09-25T08:15' }}
        maxNightDate="2026-09-26"
        onSubmit={onSubmit}
        onCancel={noop}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Fri 25 Sep' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('7 h 35 min')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith({
      nightDate: '2026-09-25',
      bedtime: '2026-09-25T00:40',
      wakeTime: '2026-09-25T08:15',
    });
  });

  it('allows saving an incomplete night and explains it is excluded from statistics', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <SessionEditor
        isNew
        initial={{ nightDate: '2026-09-25', bedtime: null, wakeTime: null }}
        maxNightDate="2026-09-26"
        onSubmit={onSubmit}
        onCancel={noop}
      />,
    );
    await user.click(screen.getByRole('switch', { name: 'Wake-up recorded' }));
    expect(screen.getByText(/not included in statistics/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save night' }));
    expect(onSubmit).toHaveBeenCalledWith({ nightDate: '2026-09-25', bedtime: '2026-09-24T23:00', wakeTime: null });
  });

  it('blocks impossible nights and shows server errors', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error('This profile already has a record for that night.'));
    render(
      <SessionEditor
        isNew
        initial={{ nightDate: '2026-09-25', bedtime: null, wakeTime: null }}
        maxNightDate="2026-09-26"
        onSubmit={onSubmit}
        onCancel={noop}
      />,
    );
    await user.click(screen.getByRole('radio', { name: 'Fri 25 Sep' }));
    const bed = screen.getByRole('textbox', { name: 'Bedtime' });
    await user.clear(bed);
    await user.type(bed, '09:00{Enter}');
    expect(screen.getByText('Wake-up must be after bedtime.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save night' })).toBeDisabled();

    await user.click(screen.getByRole('switch', { name: 'Bedtime recorded' }));
    await user.click(screen.getByRole('button', { name: 'Save night' }));
    expect(await screen.findByText('This profile already has a record for that night.')).toBeInTheDocument();
  });
});
