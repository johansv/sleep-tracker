import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { TimeField, parseClockInput } from './TimeField';

describe('parseClockInput', () => {
  it.each([
    ['23:35', '23:35'],
    ['7:05', '07:05'],
    ['0730', '07:30'],
    ['730', '07:30'],
    ['7', '07:00'],
    ['23.35', '23:35'],
    ['23 35', '23:35'],
  ])('parses %s as %s', (input, expected) => {
    expect(parseClockInput(input)).toBe(expected);
  });

  it.each(['24:00', '12:60', 'abc', '7:3', ''])('rejects %s', (input) => {
    expect(parseClockInput(input)).toBeNull();
  });
});

function Harness({ initial }: { initial: string | null }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <TimeField label="Bedtime" value={value} onChange={setValue} emptyStart="22:00" />
      <output data-testid="value">{value}</output>
    </>
  );
}

describe('TimeField', () => {
  it('steps in five-minute increments, snapping to the grid and wrapping midnight', async () => {
    const user = userEvent.setup();
    render(<Harness initial="23:57" />);
    await user.click(screen.getByRole('button', { name: 'Bedtime 5 minutes later' }));
    expect(screen.getByTestId('value')).toHaveTextContent('00:00');
    await user.click(screen.getByRole('button', { name: 'Bedtime 5 minutes earlier' }));
    expect(screen.getByTestId('value')).toHaveTextContent('23:55');
  });

  it('commits typed 24-hour input and flags invalid input', async () => {
    const user = userEvent.setup();
    render(<Harness initial="23:00" />);
    const input = screen.getByRole('textbox', { name: 'Bedtime' });
    await user.clear(input);
    await user.type(input, '0040{Enter}');
    expect(screen.getByTestId('value')).toHaveTextContent('00:40');
    await user.clear(input);
    await user.type(input, '25:00');
    await user.tab();
    expect(screen.getByRole('alert')).toHaveTextContent('24-hour');
    expect(screen.getByTestId('value')).toHaveTextContent('00:40');
  });

  it('stays visibly empty until a time is entered', async () => {
    const user = userEvent.setup();
    render(<Harness initial={null} />);
    const input = screen.getByRole('textbox', { name: 'Bedtime' });
    expect(input).toHaveValue('');
    await user.click(input);
    await user.tab();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('value')).toBeEmptyDOMElement();
    await user.click(screen.getByRole('button', { name: 'Bedtime 5 minutes earlier' }));
    expect(screen.getByTestId('value')).toHaveTextContent('22:00');
  });
});
