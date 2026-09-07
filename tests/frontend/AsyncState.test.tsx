import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import i18n from '../../src/client/locales/i18n';
import { EmptyState, ErrorState, LoadingState, PermissionState } from '@client/components/ui/AsyncState';

describe('AsyncState components', () => {
  it('renders LoadingState with the default loading label', () => {
    render(<LoadingState />);
    expect(screen.getByRole('status')).toHaveTextContent(i18n.t('ui.loading'));
  });

  it('renders LoadingState with a custom label instead of the default', () => {
    render(<LoadingState label="custom label" />);
    expect(screen.getByRole('status')).toHaveTextContent('custom label');
  });

  it('renders EmptyState with the given message', () => {
    render(<EmptyState message="nothing here" />);
    expect(screen.getByText('nothing here')).toBeInTheDocument();
  });

  it('renders ErrorState with message and retry button', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ErrorState message="boom" onRetry={onRetry} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('boom');
    await user.click(screen.getByRole('button', { name: i18n.t('ui.retry') }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('omits the retry button when onRetry is not provided', () => {
    render(<ErrorState message="boom" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders PermissionState with the admin-only message', () => {
    render(<PermissionState />);
    expect(screen.getByRole('status')).toHaveTextContent(i18n.t('ui.adminOnly'));
  });
});