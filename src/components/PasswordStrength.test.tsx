// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { passwordStrength } from '../lib/passwordStrength';
import { PasswordStrength } from './PasswordStrength';

afterEach(cleanup);

describe('PasswordStrength', () => {
  it('renders nothing until something is typed', () => {
    const { container } = render(<PasswordStrength strength={passwordStrength('')} />);
    expect(container.firstChild).toBeNull();
  });

  it('exposes the level to assistive tech and styling', () => {
    const { container } = render(<PasswordStrength strength={passwordStrength('Maple-River42')} />);
    const meter = screen.getByRole('meter');
    expect(meter.getAttribute('aria-valuenow')).toBe('3');
    expect(meter.getAttribute('aria-valuetext')).toBe('Good');
    expect(container.querySelector('.strength')?.getAttribute('data-level')).toBe('3');
    expect(container.querySelectorAll('.strength__bar.is-on')).toHaveLength(3);
  });
});
