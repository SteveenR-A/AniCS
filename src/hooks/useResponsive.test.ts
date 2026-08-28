import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useResponsive } from './useResponsive';

describe('useResponsive', () => {
  const originalUserAgent = navigator.userAgent;
  const originalInnerWidth = window.innerWidth;

  beforeEach(() => {
    // Reset to defaults before each test
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUserAgent,
      configurable: true,
    });
    window.innerWidth = 1280; // Desktop default
  });

  afterEach(() => {
    // Restore original values
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUserAgent,
      configurable: true,
    });
    window.innerWidth = originalInnerWidth;
  });

  it('should initialize as desktop when not on Android and width >= 768', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      configurable: true,
    });
    window.innerWidth = 1024;

    const { result } = renderHook(() => useResponsive());

    expect(result.current.platform).toBe('desktop');
    expect(result.current.isMobile).toBe(false);
    expect(result.current.isDesktop).toBe(true);
    expect(result.current.windowWidth).toBe(1024);
  });

  it('should initialize as mobile when user agent is Android', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36',
      configurable: true,
    });
    window.innerWidth = 1024; // Even if width is large, Android UA should take precedence

    const { result } = renderHook(() => useResponsive());

    expect(result.current.platform).toBe('mobile');
    expect(result.current.isMobile).toBe(true);
    expect(result.current.isDesktop).toBe(false);
    expect(result.current.windowWidth).toBe(1024);
  });

  it('should initialize as mobile when width < 768 (even if not Android)', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      configurable: true,
    });
    window.innerWidth = 500;

    const { result } = renderHook(() => useResponsive());

    expect(result.current.platform).toBe('mobile');
    expect(result.current.isMobile).toBe(true);
    expect(result.current.isDesktop).toBe(false);
    expect(result.current.windowWidth).toBe(500);
  });

  it('should update platform and windowWidth on resize', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      configurable: true,
    });
    window.innerWidth = 1024;

    const { result } = renderHook(() => useResponsive());

    expect(result.current.platform).toBe('desktop');
    expect(result.current.windowWidth).toBe(1024);

    // Simulate resizing to mobile width
    act(() => {
      window.innerWidth = 500;
      window.dispatchEvent(new Event('resize'));
    });

    expect(result.current.platform).toBe('mobile');
    expect(result.current.windowWidth).toBe(500);

    // Simulate resizing back to desktop width
    act(() => {
      window.innerWidth = 1200;
      window.dispatchEvent(new Event('resize'));
    });

    expect(result.current.platform).toBe('desktop');
    expect(result.current.windowWidth).toBe(1200);
  });

  it('should keep platform as mobile on resize if user agent is Android', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36',
      configurable: true,
    });
    window.innerWidth = 500;

    const { result } = renderHook(() => useResponsive());

    expect(result.current.platform).toBe('mobile');
    expect(result.current.windowWidth).toBe(500);

    // Simulate resizing to desktop width on Android device
    act(() => {
      window.innerWidth = 1024;
      window.dispatchEvent(new Event('resize'));
    });

    // Should remain 'mobile' because of Android UA
    expect(result.current.platform).toBe('mobile');
    expect(result.current.windowWidth).toBe(1024);
  });
});
