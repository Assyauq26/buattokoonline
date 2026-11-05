// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
const mocks = vi.hoisted(() => ({ push: vi.fn(), params: new URLSearchParams('q=kaos') }));
const actions = vi.hoisted(() => ({ saveProductAction: vi.fn(), setProductStatusAction: vi.fn() }));
vi.mock('@/modules/catalog/product-management.actions', () => actions);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }), useSearchParams: () => mocks.params }));
import { NavigationProvider } from '@/components/ui/navigation';
import { FilterForm } from '@/components/ui/filter-form';
import { RouteError } from '@/components/ui/route-error';
import { SearchBar } from '@/components/storefront/search-bar';
import { ProductEditor } from '@/components/admin/product-editor';
vi.stubGlobal('React', React);
afterEach(() => { cleanup(); mocks.push.mockClear(); mocks.params = new URLSearchParams('q=kaos'); });
describe('navigation controls', () => {
  it('submits GET filters through the router, encodes query values and resets pagination', () => {
    render(React.createElement(NavigationProvider, null, React.createElement(FilterForm, { action: '/admin/products', 'aria-label': 'Produk' },
      React.createElement('input', { name: 'q', defaultValue: 'Kaos & Celana' }),
      React.createElement('select', { name: 'status', defaultValue: 'DRAFT' }, React.createElement('option', { value: 'DRAFT' }, 'Draft')),
      React.createElement('button', { type: 'submit' }, 'Cari'))));
    fireEvent.submit(screen.getByRole('form', { name: 'Produk' }));
    expect(mocks.push).toHaveBeenCalledWith('/admin/products?q=Kaos+%26+Celana&status=DRAFT', { scroll: false });
  });
  it('keeps native GET action/method available without JavaScript navigation context', () => {
    render(React.createElement(FilterForm, { action: '/admin/inventory', 'aria-label': 'Stok' }, React.createElement('input', { name: 'q' })));
    const form = screen.getByRole('form', { name: 'Stok' });
    expect(form.getAttribute('method')).toBe('get');
    expect(form.getAttribute('action')).toBe('/admin/inventory');
  });
  it('synchronizes the search input after back/forward URL changes', () => {
    const component = render(React.createElement(NavigationProvider, null, React.createElement(SearchBar)));
    expect((screen.getByLabelText('Cari katalog') as HTMLInputElement).value).toBe('kaos');
    mocks.params = new URLSearchParams('q=celana');
    component.rerender(React.createElement(NavigationProvider, null, React.createElement(SearchBar)));
    expect((screen.getByLabelText('Cari katalog') as HTMLInputElement).value).toBe('celana');
    fireEvent.submit(screen.getByRole('search'));
    expect(mocks.push).toHaveBeenCalledWith('/search?q=celana', { scroll: true });
  });
  it('offers a retry without rendering internal server error details', () => {
    const reset = vi.fn(); render(React.createElement(RouteError, { reset }));
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(reset).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert').textContent).toContain('Halaman belum dapat dimuat');
  });
  it('blocks overlapping product saves and permits retry after a failed save', async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn(); // Browser API absent in jsdom.
    let finish!: (result: unknown) => void;
    actions.saveProductAction.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue({ ok: false, error: 'Periksa nama produk' });
    render(React.createElement(ProductEditor, { categories: [], brands: [], canEdit: true, canStock: true, canArchive: true }));
    const form = screen.getByTestId('product-editor');
    fireEvent.submit(form); fireEvent.submit(form);
    expect(actions.saveProductAction).toHaveBeenCalledOnce();
    finish({ ok: false, error: 'Periksa nama produk' });
    await screen.findByRole('alert');
    fireEvent.submit(form);
    expect(actions.saveProductAction).toHaveBeenCalledTimes(2);
    await screen.findByRole('alert');
  });
});
