import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { RouteErrorBoundary } from './ErrorBoundary';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('retries a failed screen while keeping the surrounding app mounted', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  let fail = true;
  function Screen() {
    if (fail) throw new Error('render failure');
    return <p>Pantalla recuperada</p>;
  }
  render(<MemoryRouter><input aria-label="Estado de navegación" defaultValue="conservado" /><RouteErrorBoundary><Screen /></RouteErrorBoundary></MemoryRouter>);
  expect(screen.getByRole('alert')).toBeInTheDocument();
  const input = screen.getByLabelText('Estado de navegación');
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: /^Reintentar$/ }));
  expect(screen.getByText('Pantalla recuperada')).toBeInTheDocument();
  expect(screen.getByLabelText('Estado de navegación')).toBe(input);
  expect(input).toHaveValue('conservado');
});

it('resets the boundary when navigating away from a failed route', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  function Broken(): never { throw new Error('render failure'); }
  function Navigation() {
    const navigate = useNavigate();
    return <button onClick={() => navigate('/other')}>Otra sección</button>;
  }
  render(<MemoryRouter initialEntries={['/broken']}><Navigation /><RouteErrorBoundary><Routes>
    <Route path="/broken" element={<Broken />} />
    <Route path="/other" element={<p>Otra sección disponible</p>} />
    <Route path="/" element={<p>Inicio disponible</p>} />
  </Routes></RouteErrorBoundary></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Otra sección' }));
  expect(screen.getByText('Otra sección disponible')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('lets the failed screen return home without a full reload', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  function Broken(): never { throw new Error('render failure'); }
  render(<MemoryRouter initialEntries={['/broken']}><RouteErrorBoundary><Routes>
    <Route path="/broken" element={<Broken />} />
    <Route path="/" element={<p>Inicio disponible</p>} />
  </Routes></RouteErrorBoundary></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Volver al inicio' }));
  expect(screen.getByText('Inicio disponible')).toBeInTheDocument();
});

it('keeps a healthy screen mounted when its query parameters change', () => {
  let mounts = 0;
  function Screen() {
    const navigate = useNavigate();
    const [value] = useState(() => ++mounts);
    return <button onClick={() => navigate('/search?q=next')}>Montaje {value}</button>;
  }
  render(<MemoryRouter initialEntries={['/search?q=first']}><RouteErrorBoundary><Screen /></RouteErrorBoundary></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Montaje 1' }));
  expect(screen.getByRole('button', { name: 'Montaje 1' })).toBeInTheDocument();
  expect(mounts).toBe(1);
});
