import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import type { OrganizationManagerOption } from '../../types/master-data';
import { normalizeSearchText } from '../../utils/formatters';

interface OrganizationManagerSelectProps {
  ariaLabel: string;
  options: readonly OrganizationManagerOption[];
  value: string;
  disabled?: boolean;
  emptyHint?: string;
  onChange: (managerEmployeeId: string) => void;
}

export function OrganizationManagerSelect({
  ariaLabel,
  options,
  value,
  disabled = false,
  emptyHint = 'Phòng ban này chưa có nhân viên trực thuộc. Bạn có thể phân công sau khi thêm nhân viên.',
  onChange,
}: OrganizationManagerSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [opensUpward, setOpensUpward] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const popoverId = useId();

  const selectedManager = useMemo(
    () => options.find((item) => item.id === value),
    [options, value],
  );

  const normalizedQuery = normalizeSearchText(search);
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return options;
    return options.filter((manager) =>
      [manager.fullName, manager.employeeCode].some((text) =>
        normalizeSearchText(text).includes(normalizedQuery),
      ),
    );
  }, [normalizedQuery, options]);

  useEffect(() => {
    if (!isOpen) return;
    const frameId = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setIsOpen(false);
        setSearch('');
        triggerRef.current?.focus();
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frameId);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  function togglePopover() {
    if (disabled) return;
    if (isOpen) {
      setIsOpen(false);
      setSearch('');
      return;
    }
    const rect = rootRef.current?.getBoundingClientRect();
    setOpensUpward(
      Boolean(rect && window.innerHeight - rect.bottom < 280 && rect.top > 280),
    );
    setSearch('');
    setIsOpen(true);
  }

  function handleSelect(nextId: string) {
    onChange(nextId);
    setIsOpen(false);
    setSearch('');
    triggerRef.current?.focus();
  }

  return (
    <div
      className={`org-parent-select org-manager-select${isOpen ? ' is-open' : ''}${opensUpward ? ' opens-upward' : ''}`}
      ref={rootRef}
    >
      <button
        className="org-parent-select-trigger"
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-controls={popoverId}
        disabled={disabled}
        onClick={togglePopover}
      >
        {selectedManager ? (
          <span className="org-parent-select-value">
            <span className="org-parent-trigger-text">
              <strong>
                {selectedManager.employeeCode} - {selectedManager.fullName}
              </strong>
            </span>
          </span>
        ) : (
          <span className="org-parent-select-placeholder">Chọn người quản lý</span>
        )}
        <ChevronDown
          className="org-parent-trigger-chevron"
          size={16}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          className="org-parent-select-popover org-manager-select-popover"
          id={popoverId}
          role="dialog"
          aria-label={ariaLabel}
        >
          {options.length > 0 && (
            <div className="org-parent-select-header">
              <div className="org-parent-search-box">
                <Search size={14} aria-hidden="true" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Tìm theo tên hoặc mã nhân viên..."
                  aria-label="Tìm người quản lý"
                />
                {search && (
                  <button
                    className="org-parent-search-clear"
                    type="button"
                    aria-label="Xóa từ khóa tìm kiếm"
                    onClick={() => {
                      setSearch('');
                      searchInputRef.current?.focus();
                    }}
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="org-parent-select-body">
            {options.length === 0 ? (
              <div className="org-parent-empty-state is-compact">
                <span>{emptyHint}</span>
              </div>
            ) : filteredOptions.length === 0 ? (
              <div className="org-parent-empty-state is-compact">
                <strong>Không tìm thấy nhân viên phù hợp</strong>
                <span>Thử nhập tên hoặc mã nhân viên khác.</span>
              </div>
            ) : (
              <div className="org-manager-option-list">
                {filteredOptions.map((manager) => {
                  const isSelected = manager.id === value;
                  return (
                    <button
                      className={`org-manager-option${isSelected ? ' is-selected' : ''}`}
                      key={manager.id}
                      type="button"
                      onClick={() => handleSelect(manager.id)}
                    >
                      <span className="org-manager-option-main">
                        <strong>
                          {manager.employeeCode} - {manager.fullName}
                        </strong>
                      </span>
                      {isSelected && (
                        <Check
                          className="org-parent-tree-check"
                          size={15}
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
