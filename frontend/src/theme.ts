/**
 * Application theme configuration
 * Colors and typography constants
 */

export const colors = {
  // Base colors
  white: '#ffffff',
  
  // Text colors (HEX #5a6065)
  text: {
    primary: '#5a6065',      // 100%
    secondary: '#848a8e',    // 75%
    tertiary: '#aeb2b4',     // 50%
    quaternary: '#d7d9da',   // 25%
  },
  
  // Accent colors (HEX #b1063a)
  accent: {
    primary: '#b1063a',      // 100%
    secondary: '#c9385e',    // 75%
    tertiary: '#d8849d',     // 50%
    quaternary: '#ecc1ce',   // 25%
  },
  
  // Layout colors (HEX #dd6108)
  layout: {
    primary: '#dd6108',      // 100%
    secondary: '#e78139',    // 75%
    tertiary: '#eea76f',     // 50%
    quaternary: '#f6d3b7',   // 25%
  },
  
  // Highlight colors (HEX #f6a800)
  highlight: {
    primary: '#f6a800',      // 100%
    secondary: '#f8bd3f',    // 75%
    tertiary: '#fad37f',     // 50%
    quaternary: '#fde9bf',   // 25%
  },
};

export const fonts = {
  family: "'Inter', system-ui, -apple-system, sans-serif",
  weight: {
    light: 300,
    regular: 400,
    bold: 700,
  },
};

export const theme = {
  colors,
  fonts,
};

export default theme;
