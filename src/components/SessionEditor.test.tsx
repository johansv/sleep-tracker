// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SessionEditor } from './SessionEditor';
import { api } from '../api/client';
vi.mock('../api/client', () => ({ api: { saveSession: vi.fn(), deleteSession: vi.fn() } }));
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
it('retains entered times after a failed save and allows retry', async () => {
  vi.mocked(api.saveSession).mockRejectedValueOnce(new Error('Connection lost. Please retry.'));
  const saved = vi.fn();
  render(<SessionEditor profileId="p" date="2026-09-25" onClose={vi.fn()} onSaved={saved} />);
  fireEvent.change(screen.getByLabelText('Bedtime time'), { target: { value: '2335' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save night' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Connection lost'));
  expect((screen.getByLabelText('Bedtime time') as HTMLInputElement).value).toBe('23:35');
  expect(saved).not.toHaveBeenCalled();
  vi.mocked(api.saveSession).mockResolvedValueOnce({
    id: 's',
    profile_id: 'p',
    night_date: '2026-09-25',
    bedtime_local: '2026-09-24T23:35',
    wake_time_local: null,
    created_at: '',
    updated_at: '',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save night' }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(api.saveSession).toHaveBeenLastCalledWith(
    'p',
    { night_date: '2026-09-25', bedtime_local: '2026-09-24T23:35', wake_time_local: null },
    undefined,
  );
});
