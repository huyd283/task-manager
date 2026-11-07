import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export interface SearchableSelectOption {
  value: string;
  label: string;
  keywords?: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  clearable?: boolean;
}

export function normalizeSearchText(value: string) {
  return value
    .toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Chọn...',
  searchPlaceholder = 'Search...',
  ariaLabel,
  className = '',
  disabled = false,
  clearable = true,
}: SearchableSelectProps) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<{ left: number; top?: number; bottom?: number; width: number; maxHeight: number } | null>(null);
  const selected = options.find((option) => option.value === value);
  const filteredOptions = useMemo(() => {
    const search = normalizeSearchText(query.trim());
    if (!search) return options;
    return options.filter((option) => normalizeSearchText(`${option.label} ${option.keywords ?? ''}`).includes(search));
  }, [options, query]);

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const openAbove = spaceBelow < 190 && spaceAbove > spaceBelow;
    setPosition({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
      ...(openAbove
        ? { bottom: window.innerHeight - rect.top + 4, maxHeight: Math.min(280, spaceAbove) }
        : { top: rect.bottom + 4, maxHeight: Math.min(280, Math.max(120, spaceBelow)) }),
      width: rect.width,
    });
  };

  const openMenu = () => {
    if (disabled) return;
    setQuery('');
    setActiveIndex(Math.max(0, options.findIndex((option) => option.value === value)));
    setOpen(true);
  };

  const closeMenu = (restoreFocus = false) => {
    setOpen(false);
    setQuery('');
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const chooseOption = (option: SearchableSelectOption) => {
    onChange(option.value);
    closeMenu(true);
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    requestAnimationFrame(() => inputRef.current?.focus());
    const reposition = () => updatePosition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) closeMenu();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(0, filteredOptions.length - 1)));
  }, [filteredOptions.length]);

  useEffect(() => {
    optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, filteredOptions.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && filteredOptions[activeIndex]) {
      event.preventDefault();
      chooseOption(filteredOptions[activeIndex]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu(true);
    }
  };

  return (
    <>
      <div className="relative min-w-0">
        <button
          ref={triggerRef}
          type="button"
          role="combobox"
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={`${id}-listbox`}
          disabled={disabled}
          onClick={() => open ? closeMenu() : openMenu()}
          onKeyDown={(event) => {
            if (!open && (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault();
              openMenu();
            }
          }}
          className={`flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-700 outline-none transition hover:bg-slate-50 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 ${className}`}
        >
          <span className={`min-w-0 truncate ${selected ? '' : 'text-slate-500'}`}>{selected?.label ?? placeholder}</span>
          <ChevronDown size={14} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {selected && value && !disabled && clearable && (
          <button
            type="button"
            aria-label={`Xóa lựa chọn: ${selected.label}`}
            onClick={() => onChange('')}
            className="absolute right-8 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
          >
            <X size={13} />
          </button>
        )}
      </div>
      {open && position && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[1100] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
          style={{ left: position.left, top: position.top, bottom: position.bottom, width: position.width }}
        >
          <div className="border-b border-slate-100 p-2">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/10">
              <Search size={14} className="shrink-0 text-slate-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={onSearchKeyDown}
                placeholder={searchPlaceholder}
                aria-label={`Tìm kiếm: ${ariaLabel}`}
                aria-controls={`${id}-listbox`}
                className="min-w-0 flex-1 bg-transparent py-2 text-xs text-slate-800 outline-none placeholder:text-slate-400"
              />
              {query && (
                <button type="button" aria-label="Xóa nội dung tìm kiếm" onClick={() => { setQuery(''); setActiveIndex(0); inputRef.current?.focus(); }} className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700">
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
          <div id={`${id}-listbox`} role="listbox" aria-label={ariaLabel} className="searchable-select-scrollbar overflow-y-auto p-1" style={{ maxHeight: position.maxHeight }}>
            {filteredOptions.length === 0 ? (
              <p className="px-3 py-5 text-center text-xs font-medium text-slate-400">Không tìm thấy kết quả</p>
            ) : filteredOptions.map((option, index) => (
              <button
                key={option.value}
                ref={(element) => { optionRefs.current[index] = element; }}
                type="button"
                role="option"
                aria-selected={option.value === value}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => chooseOption(option)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors ${index === activeIndex ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-50'}`}
              >
                <span className="min-w-0 truncate">{option.label}</span>
                {option.value === value && <Check size={14} className="shrink-0 text-blue-600" />}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
