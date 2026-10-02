// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QuotaSummary } from '../shared/types';
import { DepthChoice } from './DepthChoice';

afterEach(cleanup);
const quota = (regularUsed: number, deepUsed: number): QuotaSummary => ({ regular: { used: regularUsed, limit: 4 }, deep: { used: deepUsed, limit: 1 } });

describe('DepthChoice', () => {
  it('shows how many of each are left and which one is chosen', () => {
    render(<DepthChoice value="regular" onChange={() => undefined} quota={quota(1, 0)} />);
    expect(screen.getByText('3 left today')).toBeTruthy();
    expect(screen.getByText('1 left today')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Regular/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /Deep search/ }).getAttribute('aria-pressed')).toBe('false');
  });

  it('lets you switch to deep', () => {
    const onChange = vi.fn();
    render(<DepthChoice value="regular" onChange={onChange} quota={quota(0, 0)} />);
    fireEvent.click(screen.getByRole('button', { name: /Deep search/ }));
    expect(onChange).toHaveBeenCalledWith('deep');
  });

  it("disables an option once it's used up", () => {
    const onChange = vi.fn();
    render(<DepthChoice value="regular" onChange={onChange} quota={quota(0, 1)} />);
    const deep = screen.getByRole('button', { name: /Deep search/ }) as HTMLButtonElement;
    expect(deep.disabled).toBe(true);
    expect(screen.getByText('Used up today')).toBeTruthy();
    fireEvent.click(deep);
    expect(onChange).not.toHaveBeenCalled();
    cleanup();
    render(<DepthChoice value="deep" onChange={onChange} quota={quota(4, 0)} />);
    expect((screen.getByRole('button', { name: /Regular/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('still works before the numbers have loaded', () => {
    render(<DepthChoice value="regular" onChange={() => undefined} quota={null} />);
    expect((screen.getByRole('button', { name: /Deep search/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});
