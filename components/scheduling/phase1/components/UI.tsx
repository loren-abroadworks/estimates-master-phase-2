
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, MoreVertical, Edit2, Trash2, Check, ChevronDown, Copy, Calculator, Delete } from 'lucide-react';
import { Components, Typography, Radius, Shadows } from '../theme/designSystem';
import { useTranslation } from '../i18n/LanguageContext';

// Updated Card using Design System
export const Card: React.FC<{ children?: React.ReactNode; className?: string; style?: React.CSSProperties, variant?: 'base' | 'interactive' | 'flat', onClick?: (e: React.MouseEvent<HTMLDivElement>) => void }> = ({ children, className = "", style, variant = 'base', onClick }) => (
  <div 
    className={`${Components.Card[variant]} ${className}`} 
    style={style}
    onClick={onClick}
  >
    {children}
  </div>
);

// Updated Button using Design System
export const Button: React.FC<{ 
  children?: React.ReactNode; 
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void; 
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'; 
  className?: string;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  title?: string;
}> = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  className = "",
  disabled = false,
  size = 'md',
  title
}) => {
  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className={`${Components.Button.base} ${Components.Button.sizes[size]} ${Components.Button.variants[variant]} ${className}`}
      title={title}
    >
      {children}
    </button>
  );
};

export const InputGroup: React.FC<{ label: string, children?: React.ReactNode, className?: string }> = ({ label, children, className = "" }) => (
  <div className={`flex flex-col gap-2 w-full ${className}`}>
    <label className={Typography.label}>{label}</label>
    {children}
  </div>
);

export const formatPhoneNumber = (value: string) => {
  if (!value) return value;
  const phoneNumber = value.replace(/[^\d]/g, '');
  const phoneNumberLength = phoneNumber.length;
  if (phoneNumberLength < 4) return phoneNumber;
  if (phoneNumberLength < 7) {
    return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3)}`;
  }
  return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6, 10)}`;
};

export const PhoneInput = ({ 
  value, 
  onChange, 
  placeholder = "(555) 123-4567",
  className = "",
  label
}: { 
  value: string; 
  onChange: (val: string) => void; 
  placeholder?: string;
  className?: string;
  label?: string;
}) => {
  const handleChange = (val: string) => {
    // If user is deleting, we might want to allow it raw, but strictly formatting usually feels okay if logic is sound.
    // We'll strip non-digits and re-format.
    const formatted = formatPhoneNumber(val);
    onChange(formatted);
  };

  return (
    <TextInput
      label={label}
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
      type="tel"
    />
  );
};

// Updated Inputs using Design System
export const TextInput = ({
  value,
  onChange,
  placeholder,
  className = "",
  label,
  ariaLabel,
  type = "text"
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  label?: string;
  ariaLabel?: string;
  type?: string;
}) => (
  <div className="flex flex-col gap-2 w-full group">
    {label && <span className={Typography.label}>{label}</span>}
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={`${Components.Input.base} ${Components.Input.sizes.md} text-base ${className}`}
    />
  </div>
);

export const TextArea = ({
  value,
  onChange,
  placeholder,
  className = "",
  label,
  ariaLabel,
  rows = 4
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  label?: string;
  ariaLabel?: string;
  rows?: number;
}) => (
  <div className="flex flex-col gap-2 w-full group">
    {label && <span className={Typography.label}>{label}</span>}
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      aria-label={ariaLabel}
      className={`${Components.Input.base} ${Components.Input.sizes.md} text-base resize-none ${className}`}
    />
  </div>
);

export const NumberInput = ({ 
  value, 
  onChange, 
  placeholder,
  className = "",
  step = 1,
  min = 0,
  label,
  disabled
}: { 
  value: number | undefined; 
  onChange: (val: number) => void; 
  placeholder?: string;
  className?: string;
  step?: number;
  min?: number;
  label?: string;
  disabled?: boolean;
}) => (
  <div className="flex flex-col gap-2 w-full group">
    {label && <span className={Typography.label}>{label}</span>}
    <input
      type="number"
      value={value === 0 ? '' : value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      placeholder={placeholder}
      min={min}
      step={step}
      disabled={disabled}
      className={`${Components.Input.base} ${Components.Input.sizes.md} text-base ${className} ${disabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800 dark:text-gray-500' : ''}`}
    />
  </div>
);

export const TimeInput = ({
  value,
  onChange,
  onBlur,
  onFocus,
  className = "",
  step,
  label,
  ariaLabel,
  disabled,
  size = "md"
}: {
  value: string | undefined;
  onChange: (val: string) => void;
  /** Fired with the field's value when it loses focus. Useful for committing an
   *  expensive action (e.g. a reschedule) without firing on every keystroke. */
  onBlur?: (val: string) => void;
  /** Fired when the field gains focus. */
  onFocus?: () => void;
  className?: string;
  step?: number;
  label?: string;
  /** Accessible name when no visible label is rendered (e.g. compact paired fields). */
  ariaLabel?: string;
  disabled?: boolean;
  /** Field density. "sm" is the compact variant for tight rows (e.g. shift cards). */
  size?: 'sm' | 'md';
}) => (
  <div className="flex flex-col gap-2 w-full group">
    {label && <span className={Typography.label}>{label}</span>}
    <input
      type="time"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur ? (e) => onBlur(e.target.value) : undefined}
      onFocus={onFocus}
      step={step}
      aria-label={ariaLabel}
      disabled={disabled}
      className={`${Components.Input.base} ${Components.Input.sizes[size]} ${className} ${disabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800 dark:text-gray-500' : ''}`}
    />
  </div>
);

export const SmartMathInput = ({
  value,
  onChange,
  disabled,
  className = "",
  placeholder
}: {
  value: number;
  onChange: (val: number) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) => {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState(value === 0 ? "" : value?.toString() || "");
  const [isFocused, setIsFocused] = useState(false);
  const [error, setError] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isFocused && !showCalculator) {
      setInputValue(value === 0 ? "" : value?.toString() || "");
    }
  }, [value, isFocused, showCalculator]);

  const evaluateExpression = (expression: string): number | null => {
    try {
      if (/[^0-9+\-*/().\s]/.test(expression)) {
        return null; 
      }
      // eslint-disable-next-line no-new-func
      const result = new Function(`return ${expression}`)();
      if (!isFinite(result) || isNaN(result)) return null;
      return result;
    } catch (e) {
      return null;
    }
  };

  const handleCommit = (finalValue?: string) => {
    const valToEval = finalValue !== undefined ? finalValue : inputValue;
    
    if (valToEval.trim() === "") {
        onChange(0);
        setInputValue("");
        setError(false);
        return true;
    }

    const result = evaluateExpression(valToEval);
    if (result !== null) {
      onChange(result);
      setInputValue(result === 0 ? "" : result.toString());
      setError(false);
      return true;
    } else {
      setError(true);
      return false;
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCommit();
      inputRef.current?.blur();
    }
  };

  // Calculator Logic
  const [calcDisplay, setCalcDisplay] = useState("");

  const openCalculator = () => {
      setCalcDisplay(inputValue);
      setShowCalculator(true);
  };

  const closeCalculator = () => {
      setShowCalculator(false);
      handleCommit(calcDisplay);
  };

  const calcInsert = (char: string) => {
      setCalcDisplay(prev => prev + char);
  };

  const calcBackspace = () => {
      setCalcDisplay(prev => prev.slice(0, -1));
  };

  const calcClear = () => {
      setCalcDisplay("");
  };

  const calcSolve = () => {
      const success = handleCommit(calcDisplay);
      if (success) {
          closeCalculator();
      }
  };
  
  const CalculatorModal = () => (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/20 backdrop-blur-sm animate-in fade-in duration-200" onMouseDown={closeCalculator}>
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-700 p-6 w-80 animate-in zoom-in-95 duration-200" onMouseDown={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-gray-900 dark:text-white text-lg">{t('UI.calculator')}</h3>
                  <button onClick={closeCalculator} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                      <X className="w-5 h-5" />
                  </button>
              </div>
              
              <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 mb-4 border border-gray-200 dark:border-gray-700 relative">
                  <div className="text-gray-500 text-xs h-4 mb-1 uppercase tracking-wide font-bold">{t('UI.enterCalculation')}</div>
                  <div className="flex items-center">
                    <input 
                        type="text" 
                        value={calcDisplay} 
                        readOnly 
                        className="w-full bg-transparent text-3xl font-bold text-gray-900 dark:text-white outline-none text-right font-mono tracking-wider pr-8"
                        placeholder="0"
                    />
                    <button 
                        onClick={calcBackspace}
                        className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <Delete className="w-6 h-6" />
                    </button>
                  </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                  <button onClick={calcClear} className="col-span-1 p-4 rounded-2xl bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-bold text-xl hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors shadow-sm">C</button>
                  <button onClick={() => calcInsert('(')} className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold text-xl hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors shadow-sm">(</button>
                  <button onClick={() => calcInsert(')')} className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold text-xl hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors shadow-sm">)</button>
                  <button onClick={() => calcInsert('/')} className="p-4 rounded-2xl bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-bold text-xl hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors shadow-sm">÷</button>
                  
                  {[7, 8, 9].map(num => (
                      <button key={num} onClick={() => calcInsert(num.toString())} className="p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-gray-900 dark:text-white font-bold text-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-sm">{num}</button>
                  ))}
                  <button onClick={() => calcInsert('*')} className="p-4 rounded-2xl bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-bold text-xl hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors shadow-sm">×</button>
                  
                  {[4, 5, 6].map(num => (
                      <button key={num} onClick={() => calcInsert(num.toString())} className="p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-gray-900 dark:text-white font-bold text-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-sm">{num}</button>
                  ))}
                  <button onClick={() => calcInsert('-')} className="p-4 rounded-2xl bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-bold text-xl hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors shadow-sm">-</button>
                  
                  {[1, 2, 3].map(num => (
                      <button key={num} onClick={() => calcInsert(num.toString())} className="p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-gray-900 dark:text-white font-bold text-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-sm">{num}</button>
                  ))}
                  <button onClick={() => calcInsert('+')} className="p-4 rounded-2xl bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-bold text-xl hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors shadow-sm">+</button>
                  
                  <button onClick={() => calcInsert('0')} className="col-span-2 p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-gray-900 dark:text-white font-bold text-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-sm">0</button>
                  <button onClick={() => calcInsert('.')} className="p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-gray-900 dark:text-white font-bold text-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-sm">.</button>
                  <button onClick={calcSolve} className="p-4 rounded-2xl bg-primary-600 text-white font-bold text-xl hover:bg-primary-700 transition-colors shadow-lg shadow-primary-500/30">=</button>
              </div>
          </div>
      </div>
  );

  return (
    <div ref={containerRef} className={`flex items-center gap-1 w-full relative group`}>
        <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => {
                setInputValue(e.target.value);
                setError(false);
            }}
            onFocus={() => {
                setIsFocused(true);
            }}
            onBlur={() => {
               setIsFocused(false);
               setTimeout(() => {
                   if (!showCalculator) {
                       handleCommit();
                   }
               }, 100);
            }}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className={`flex-1 w-full min-w-0 pl-2 pr-2 py-1.5 border ${error ? 'border-red-300 bg-red-50 dark:bg-red-900/20 focus:ring-red-200' : 'border-gray-400 dark:border-gray-500 bg-white dark:bg-gray-900 focus:ring-primary-400/20'} text-gray-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:border-primary-400 outline-none transition-all disabled:text-gray-400 disabled:bg-gray-100 dark:disabled:bg-gray-800 ${className}`}
        />
        <button 
            className="p-1.5 text-gray-400 hover:text-primary-600 transition-all rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 flex-shrink-0"
            onClick={openCalculator}
            tabIndex={-1}
            title={t('UI.openCalculator')}
            disabled={disabled}
        >
            <Calculator className="w-4 h-4" />
        </button>
        
        {showCalculator && <CalculatorModal />}
    </div>
  );
};

export const Select = ({ value, onChange, options, className = "", disabled = false, id, ariaLabel }: { value: string | number, onChange: (val: string) => void, options: { label: string, value: string | number }[], className?: string, disabled?: boolean, id?: string, ariaLabel?: string }) => {
  return (
    <div className="relative w-full">
      <select
        id={id}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`${Components.Input.base} ${Components.Input.sizes.md} text-base appearance-none cursor-pointer disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:text-gray-400 ${className}`}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
    </div>
  );
};

export const Badge = ({ children, color = 'gray', className = "" }: { children?: React.ReactNode, color?: keyof typeof Components.Badge.colors, className?: string }) => {
  return (
    <span className={`${Components.Badge.base} ${Components.Badge.colors[color] || Components.Badge.colors.gray} ${className}`}>
      {children}
    </span>
  );
};

// Responsive Modal
export const Modal = ({ isOpen, onClose, title, children, hideHeader = false, maxWidth = "md:max-w-2xl", hidden = false }: { isOpen: boolean, onClose: () => void, title: string, children?: React.ReactNode, hideHeader?: boolean, maxWidth?: string, hidden?: boolean }) => {
  if (!isOpen) return null;
  return (
    // `hidden` keeps the modal mounted (preserving its state) but invisible — used when
    // another modal temporarily takes over, e.g. the break editor opened from within.
    <div className={`fixed inset-0 z-[150] ${hidden ? 'hidden' : 'flex'} items-end md:items-center justify-center p-0 md:p-4 bg-gray-900/50 backdrop-blur-sm animate-in fade-in duration-200`}>
      <div 
        className={`bg-white dark:bg-gray-800 w-full ${maxWidth} h-[95vh] md:h-auto md:max-h-[90vh] flex flex-col animate-in slide-in-from-bottom-10 md:zoom-in-95 duration-200
        rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden border dark:border-gray-700`}
      >
        {!hideHeader && (
            <div className="px-6 py-5 md:px-8 md:py-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-white dark:bg-gray-800 sticky top-0 z-10">
                <h3 className={Typography.h3}>{title}</h3>
                <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                    <X className="w-6 h-6" />
                </button>
            </div>
        )}
        {hideHeader && (
            <div className="absolute top-4 right-4 z-10">
                 <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                    <X className="w-6 h-6" />
                </button>
            </div>
        )}
        <div className="p-6 md:p-8 overflow-y-auto custom-scrollbar flex-1">
          {children}
        </div>
      </div>
    </div>
  );
};

export const SearchInput = ({ value, onChange, placeholder, className = "" }: { value: string, onChange: (val: string) => void, placeholder?: string, className?: string }) => {
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder !== undefined ? placeholder : t('UI.searchPlaceholder');
  return (
    <div className={`relative w-full ${className}`}>
      <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={resolvedPlaceholder}
        className={`${Components.Input.base} ${Components.Input.sizes.md} text-base pl-12 ${value ? 'pr-12' : 'pr-5'}`}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={t('UI.clearSearch')}
          className="absolute right-3 top-1/2 -translate-y-1/2 grid place-items-center w-7 h-7 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

export const KebabMenu = ({ 
  onEdit, 
  onDelete, 
  onDuplicate,
  items,
  className = "" 
}: { 
  onEdit?: () => void, 
  onDelete?: () => void, 
  onDuplicate?: () => void,
  items?: { label: string, onClick: () => void, icon?: React.ElementType, className?: string }[],
  className?: string
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (isOpen && buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        let top = rect.bottom + window.scrollY + 8;
        let left = rect.right + window.scrollX - 224; 

        if (window.innerWidth < 640) {
           left = Math.max(10, Math.min(left, window.innerWidth - 234));
        }

        setCoords({ top, left });
    }
  }, [isOpen]);

  useEffect(() => {
    const handleDismiss = (event: Event) => {
        if (event.type === 'resize' || event.type === 'scroll') {
             setIsOpen(false);
             return;
        }
        
        const menuEl = document.getElementById('kebab-menu-portal');
        if (
            buttonRef.current && 
            !buttonRef.current.contains(event.target as Node) && 
            menuEl && 
            !menuEl.contains(event.target as Node)
        ) {
            setIsOpen(false);
        }
    };

    if (isOpen) {
        document.addEventListener("mousedown", handleDismiss);
        window.addEventListener("scroll", handleDismiss, true);
        window.addEventListener("resize", handleDismiss);
    }
    return () => {
        document.removeEventListener("mousedown", handleDismiss);
        window.removeEventListener("scroll", handleDismiss, true);
        window.removeEventListener("resize", handleDismiss);
    };
  }, [isOpen]);

  const menuContent = isOpen ? (
        <div 
            id="kebab-menu-portal"
            style={{ 
                position: 'absolute', 
                top: `${coords.top}px`, 
                left: `${coords.left}px`,
                zIndex: 99999 
            }}
            className="w-56 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-2 animate-in fade-in zoom-in-95 duration-150"
        >
          {items && items.map((item, idx) => (
             <button 
                key={idx}
                onClick={(e) => { 
                    e.stopPropagation(); 
                    item.onClick(); 
                    setIsOpen(false); 
                }} 
                className={`w-full text-left px-4 py-2.5 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-primary-600 flex items-center gap-2 transition-colors ${item.className || ''}`}
             >
                {item.icon && <item.icon className="w-4 h-4" />}
                {item.label}
             </button>
          ))}
          
          {(items && items.length > 0 && (onEdit || onDuplicate || onDelete)) && <div className="h-px bg-gray-100 dark:bg-gray-700 my-1" />}

          {onEdit && (
            <button onClick={(e) => { e.stopPropagation(); onEdit(); setIsOpen(false); }} className="w-full text-left px-4 py-2.5 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-primary-600 flex items-center gap-2 transition-colors">
              <Edit2 className="w-4 h-4" /> {t('UI.edit')}
            </button>
          )}
          {onDuplicate && (
            <button onClick={(e) => { e.stopPropagation(); onDuplicate(); setIsOpen(false); }} className="w-full text-left px-4 py-2.5 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-primary-600 flex items-center gap-2 transition-colors">
              <Copy className="w-4 h-4" /> {t('UI.duplicate')}
            </button>
          )}
          {onDelete && (
            <button onClick={(e) => { e.stopPropagation(); onDelete(); setIsOpen(false); }} className="w-full text-left px-4 py-2.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center gap-2 transition-colors">
              <Trash2 className="w-4 h-4" /> {t('UI.delete')}
            </button>
          )}
        </div>
  ) : null;

  return (
    <div className={`relative ${className}`}>
      <button
        ref={buttonRef}
        aria-label={t('UI.moreActions')}
        onClick={(e) => {
            e.stopPropagation();
            setIsOpen(!isOpen);
        }}
        className={`p-2 rounded-lg transition-colors ${isOpen ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
      >
        <MoreVertical className="w-5 h-5" />
      </button>
      {isOpen && typeof document !== 'undefined' && createPortal(menuContent, document.body)}
    </div>
  );
};

export const CheckboxGroup = ({ options, selectedValues, onChange }: { options: { label: string, value: string }[], selectedValues: string[], onChange: (values: string[]) => void }) => {
  const toggle = (value: string) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter(v => v !== value));
    } else {
      onChange([...selectedValues, value]);
    }
  };

  return (
    <div className="space-y-2">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => toggle(opt.value)}
          className={`flex items-center gap-3 w-full p-3 rounded-xl border transition-all ${selectedValues.includes(opt.value) ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}
        >
          <div className={`w-6 h-6 rounded-lg border flex items-center justify-center transition-colors ${selectedValues.includes(opt.value) ? 'bg-primary-500 border-primary-500 text-white' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'}`}>
            {selectedValues.includes(opt.value) && <Check className="w-4 h-4" />}
          </div>
          <span className={`font-medium text-base ${selectedValues.includes(opt.value) ? 'text-primary-900 dark:text-primary-300' : 'text-gray-700 dark:text-gray-300'}`}>{opt.label}</span>
        </button>
      ))}
    </div>
  );
};

export const Toggle = ({ label, checked, onChange, ariaLabel }: { label?: string, checked: boolean, onChange: (val: boolean) => void, ariaLabel?: string }) => (
  <div className="flex items-center justify-between gap-4">
    {label && <span className={Typography.body}>{label}</span>}
    <button
      onClick={() => onChange(!checked)}
      aria-label={ariaLabel}
      aria-pressed={checked}
      className={`w-12 h-7 rounded-full relative transition-colors duration-300 flex-shrink-0 ${checked ? 'bg-primary-500' : 'bg-gray-200 dark:bg-gray-700'}`}
    >
      <div className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-300 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  </div>
);

// Transient bottom-center notification with an optional Undo action.
// Auto-dismisses after `durationMs` (default 10s); the timer resets whenever a
// new toast is shown (parent passes a fresh `key` keyed on the toast id).
export const Toast: React.FC<{
  message: string;
  onUndo?: () => void;
  onDismiss: () => void;
  durationMs?: number;
}> = ({
  message,
  onUndo,
  onDismiss,
  durationMs = 10000,
}) => {
  const { t } = useTranslation();
  useEffect(() => {
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [onDismiss, durationMs]);

  return createPortal(
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] animate-in slide-in-from-bottom-5 fade-in duration-200">
      <div className="flex items-center gap-4 bg-slate-900 dark:bg-gray-700 text-white pl-5 pr-3 py-3 rounded-2xl shadow-2xl border border-slate-700 dark:border-gray-600 max-w-[90vw]">
        <Check className="w-4 h-4 text-green-400 shrink-0" />
        <span className="text-sm font-medium truncate">{message}</span>
        {onUndo && (
          <button
            onClick={() => { onUndo(); onDismiss(); }}
            className="text-sm font-bold text-primary-300 hover:text-primary-200 uppercase tracking-wider px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors shrink-0"
          >
            {t('UI.undo')}
          </button>
        )}
        <button onClick={onDismiss} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>,
    document.body,
  );
};

// Styled hover tooltip. Portal-based + fixed positioning so it is never clipped
// by overflow-hidden ancestors (e.g. calendar job cards).
export const Tooltip = ({
  content,
  children,
  className = "",
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setCoords({ x: r.left + r.width / 2, y: r.top });
  };
  const hide = () => setCoords(null);

  return (
    <span
      ref={ref}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      className={`inline-flex ${className}`}
    >
      {children}
      {coords && createPortal(
        <div
          style={{ left: coords.x, top: coords.y - 8 }}
          className="fixed z-[210] -translate-x-1/2 -translate-y-full px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-gray-700 text-white text-xs font-semibold shadow-xl max-w-[240px] text-center leading-snug pointer-events-none animate-in fade-in duration-100"
        >
          {content}
        </div>,
        document.body,
      )}
    </span>
  );
};

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}

// Lightweight positioned popover menu. Renders at (x, y), closes on outside
// click or Escape. Reused for calendar right-click actions.
export const ContextMenu = ({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handleDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Clamp so the menu stays inside the viewport.
  const left = Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : x) - 240);
  const top = Math.min(y, (typeof window !== 'undefined' ? window.innerHeight : y) - (items.length * 44 + 16));

  return createPortal(
    <div
      ref={ref}
      style={{ left, top }}
      className="fixed z-[160] min-w-[220px] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-2 animate-in fade-in zoom-in-95 duration-100"
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => { item.onClick(); onClose(); }}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-colors ${
            item.danger
              ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
              : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          {item.icon && <span className="shrink-0 w-4 h-4 flex items-center justify-center">{item.icon}</span>}
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
};
