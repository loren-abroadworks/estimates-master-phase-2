
export const Breakpoints = {
  mobile: '0px',      // Default in Tailwind
  tablet: '768px',    // md:
  desktop: '1024px',  // lg:
  wide: '1280px',     // xl:
};

export const Colors = {
  primary: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6',
    600: '#2563eb', // Royal Blue
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a8a',
  },
  gray: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
  },
  state: {
    success: 'text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-900/30 dark:border-green-800',
    warning: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-900/30 dark:border-amber-800',
    error: 'text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/30 dark:border-red-800',
    info: 'text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-900/30 dark:border-blue-800',
  }
};

export const Radius = {
  sm: 'rounded-lg',
  md: 'rounded-xl',
  lg: 'rounded-2xl',
  xl: 'rounded-3xl',
  full: 'rounded-full',
};

export const Shadows = {
  sm: 'shadow-sm',
  md: 'shadow-md',
  lg: 'shadow-lg',
  xl: 'shadow-xl',
  primary: 'shadow-lg shadow-primary-500/20', // Signature glow
  card: 'shadow-sm hover:shadow-md transition-shadow duration-200',
};

// Responsive Typography Scale
export const Typography = {
  // Headings (Manrope)
  h1: "font-heading font-extrabold tracking-tight text-3xl md:text-5xl lg:text-6xl leading-tight text-gray-900 dark:text-white",
  h2: "font-heading font-bold tracking-tight text-2xl md:text-4xl leading-tight text-gray-900 dark:text-white",
  h3: "font-heading font-bold text-xl md:text-2xl leading-snug text-gray-900 dark:text-white",
  h4: "font-heading font-bold text-lg md:text-xl text-gray-800 dark:text-gray-100",
  
  // Body (Roboto)
  lead: "font-sans text-lg md:text-xl text-gray-500 dark:text-gray-400 leading-relaxed",
  body: "font-sans text-base leading-relaxed text-gray-600 dark:text-gray-300",
  small: "font-sans text-sm text-gray-500 dark:text-gray-400",
  tiny: "font-sans text-xs text-gray-400 dark:text-gray-500 font-medium",
  
  // Specialized
  label: "font-sans text-xs font-bold text-gray-500 dark:text-gray-400 tracking-widest",
  stat: "font-heading font-black text-gray-900 dark:text-white text-3xl md:text-4xl tracking-tight",
  mono: "font-mono text-sm font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded"
};

export const Spacing = {
  containerPx: "px-4 md:px-8 lg:px-12",
  sectionPy: "py-12 md:py-24",
  stackSm: "space-y-2",
  stackMd: "space-y-4 md:space-y-6",
  stackLg: "space-y-8 md:space-y-12",
};

// Component Specific Styles
export const Components = {
  Card: {
    base: `bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 ${Radius.lg} ${Shadows.sm} overflow-hidden`,
    interactive: `bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 ${Radius.lg} ${Shadows.card} hover:border-primary-300 dark:hover:border-primary-600 cursor-pointer transition-all active:scale-[0.98]`,
    flat: `bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 ${Radius.lg}`,
  },
  Button: {
    base: `font-medium transition-all duration-200 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:pointer-events-none ${Radius.md}`,
    sizes: {
      sm: "px-3 py-1.5 text-sm",
      md: "px-5 py-2.5 text-sm md:text-base",
      lg: "px-6 py-3.5 text-base md:text-lg font-bold"
    },
    variants: {
      primary: `bg-primary-600 text-white hover:bg-primary-700 ${Shadows.sm} border border-transparent hover:shadow-primary-500/20`,
      secondary: `bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600 ${Shadows.sm}`,
      ghost: "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white bg-transparent border-transparent",
      danger: "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 border border-red-100 dark:border-red-800 hover:border-red-200 dark:hover:border-red-700",
      outline: "bg-transparent border-2 border-primary-600 text-gray-900 dark:text-white hover:bg-primary-50 dark:hover:bg-primary-900/20"
    }
  },
  Input: {
    base: `w-full bg-white dark:bg-gray-900 text-gray-900 dark:text-white border border-gray-400 dark:border-gray-500 focus:bg-white dark:focus:bg-gray-900 ${Radius.md} focus:ring-4 focus:ring-primary-400/20 focus:border-primary-400 outline-none transition-all placeholder-gray-400`,
    sizes: {
      sm: "px-3 py-2 text-sm",
      md: "px-5 py-3 text-base md:text-lg",
    }
  },
  Badge: {
    base: `px-2.5 py-0.5 rounded-full text-xs font-bold inline-flex items-center gap-1`,
    colors: {
      gray: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700',
      blue: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800',
      green: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800',
      amber: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
      red: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800',
      primary: 'bg-primary-100 dark:bg-primary-900/40 text-primary-900 dark:text-primary-300 border border-primary-200 dark:border-primary-800',
      purple: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800',
    }
  }
};

export type TypographyVariant = keyof typeof Typography;
