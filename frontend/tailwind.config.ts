import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#080808',
        'surface-1': '#121214',
        'surface-2': '#1c1c1f',
        'surface-3': '#26262a',
        ink: '#ffffff',
        'ink-muted': '#999999',
        'accent-blue': '#0099ff',
        'on-primary': '#080808',
        hairline: 'rgba(255,255,255,0.08)',
        'hairline-soft': 'rgba(255,255,255,0.04)',
        'semantic-success': '#22c55e',
      },
      fontFamily: {
        display: ['"Mona Sans"', 'Inter', 'sans-serif'],
        body: ['"Inter Variable"', 'Inter', 'sans-serif'],
      },
      borderRadius: {
        xs: '4px',
        sm: '6px',
        md: '10px',
        lg: '15px',
        xl: '20px',
        '2xl': '24px',
        '3xl': '30px',
        pill: '100px',
        full: '9999px',
      },
      spacing: {
        hair: '1px',
        xxs: '4px',
        xs: '8px',
        'sm-framer': '12px',
        'md-framer': '15px',
        'lg-framer': '20px',
        'xl-framer': '30px',
        '2xl-framer': '40px',
        section: '96px',
      },
      screens: {
        xs: '420px',
      },
    },
  },
  plugins: [],
} satisfies Config;
