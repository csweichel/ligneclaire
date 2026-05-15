name: Ligne Claire
colors:
  surface: '#faf8ff'
  surface-dim: '#d8d9e4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3fe'
  surface-container: '#ecedf8'
  surface-container-high: '#e7e7f3'
  surface-container-highest: '#e1e2ed'
  on-surface: '#191b23'
  on-surface-variant: '#424654'
  inverse-surface: '#2e3039'
  inverse-on-surface: '#eff0fb'
  outline: '#737786'
  outline-variant: '#c2c6d7'
  surface-tint: '#0056d0'
  primary: '#0055cd'
  on-primary: '#ffffff'
  primary-container: '#276ef1'
  on-primary-container: '#fffeff'
  inverse-primary: '#b1c5ff'
  secondary: '#5f5e5e'
  on-secondary: '#ffffff'
  secondary-container: '#e5e2e1'
  on-secondary-container: '#656464'
  tertiary: '#006b45'
  on-tertiary: '#ffffff'
  tertiary-container: '#008759'
  on-tertiary-container: '#fffffb'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2ff'
  primary-fixed-dim: '#b1c5ff'
  on-primary-fixed: '#001947'
  on-primary-fixed-variant: '#00419f'
  secondary-fixed: '#e5e2e1'
  secondary-fixed-dim: '#c8c6c5'
  on-secondary-fixed: '#1c1b1b'
  on-secondary-fixed-variant: '#474646'
  tertiary-fixed: '#7bfabb'
  tertiary-fixed-dim: '#5ddda1'
  on-tertiary-fixed: '#002112'
  on-tertiary-fixed-variant: '#005234'
  background: '#faf8ff'
  on-background: '#191b23'
  surface-variant: '#e1e2ed'
typography:
  display-coords:
    fontFamily: JetBrains Mono
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 28px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 16px
  code-terminal:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin: 24px
  container-padding: 12px
---

## Brand & Style
The design system is engineered for the high-precision environment of CNC and pen-plotter control. The brand personality is clinical, utilitarian, and dependable, evoking the feeling of professional industrial machinery. It targets operators and technical creators who require clarity over decoration. 

The visual style is **Corporate / Modern** with a lean toward **Minimalism**. It prioritizes technical legibility and high information density without visual clutter. By using a light-themed palette and a rigid structure, the UI creates an environment of focus and operational safety, ensuring that machine status and coordinates are immediately discernable at a glance.

## Colors
The palette is rooted in an industrial "off-white" aesthetic to reduce eye strain in well-lit workshop environments. 

- **Primary:** A crisp, technical blue used for active states and primary actions. It communicates stability and software precision.
- **Secondary (Text/Deep Neutral):** A deep charcoal for high-contrast typography, ensuring maximum legibility of coordinates and G-code.
- **Tertiary (Accent):** A forest green used for "Running" or "Safe" statuses, stripped of any digital glow to maintain a professional, hardware-integrated look.
- **Backgrounds:** Use layered off-whites and light grays to define different functional zones (e.g., the console versus the preview area).

## Typography
Typography is split between functional system information and technical data. 

- **Hanken Grotesk** is used for the interface architecture (menus, labels, buttons) to provide a modern, approachable, yet professional feel.
- **JetBrains Mono** is utilized for all machine-related data, coordinates (WPOS), and the console. Its monospaced nature ensures that numbers don't jump horizontally during rapid updates, which is critical for monitoring live toolheads.

Scale headlines appropriately for the desktop; for mobile-specific views, reduce `display-coords` to 24px to fit within narrow grid columns.

## Layout & Spacing
The design system utilizes a **Fixed Grid** model for desktop control centers, ensuring that critical controls (like Jog buttons) stay in predictable physical locations. 

- **Grid:** A 12-column system with tight 16px gutters to maximize screen real estate.
- **Rhythm:** An 8px baseline grid is used for vertical rhythm, but internal component padding often uses a 4px "unit" for high-density layouts.
- **Reflow:** On tablets, the side panels (Project Management and Machine Settings) collapse into a drawer or a bottom sheet to prioritize the Preview and WPOS readouts. 
- **Density:** High density is preferred. Information should be grouped into distinct card-like modules with consistent internal padding.

## Elevation & Depth
Depth is communicated through **Low-contrast outlines** and tonal shifts rather than shadows. This mimics the appearance of physical control panels and keeps the interface feeling "flat" and technical.

- **Level 0 (Background):** Light gray (#F5F5F7).
- **Level 1 (Modules/Cards):** White (#FFFFFF) with a 1px solid border (#D1D5DB).
- **Level 2 (In-set elements):** Subtle inner-shadows or darker gray fills are used for input fields and terminal areas to show they are "recessed" containers for data.
- **Interactive:** Hover states involve a subtle background shift (e.g., White to #F9FAFB) rather than a lift effect.

## Shapes
To reinforce the "Precise/Industrial" theme while maintaining a contemporary feel, the design system uses **Rounded (Level 2)** shapes. 

- All primary buttons and containers use an **8px (0.5rem)** corner radius.
- Larger layout containers (like the Preview pane) use a **16px (1.0rem)** radius.
- This increased rounding softens the industrial aesthetic, moving away from purely utilitarian sharp edges toward a more user-friendly, modern interface that remains structured and engineering-led.

## Components
- **Buttons:** Solid fills for primary actions; outlined for secondary actions. Use tight padding (8px 16px) to allow for more controls in the Jog section.
- **Jog Controls:** A 3x3 grid of buttons with 4px spacing. Use the primary color for directional arrows to draw focus.
- **Console:** A dark-recessed block using #121212 background with light gray JetBrains Mono text to simulate a traditional terminal.
- **Coordinate Readouts (WPOS):** High-contrast black backgrounds with light-gray or tertiary green text. The text must be monospaced and significantly larger than body copy.
- **Input Fields:** Rounded corners (8px), 1px neutral border, and a subtle blue focus ring that is only 1px wide to maintain precision.
- **Progress Bars:** Use the tertiary green for "completion" but ensure the track is a light gray with rounded caps consistent with the 8px theme.
- **Logo:** The Ligne Claire logo should be rendered in the secondary charcoal color for the light theme, positioned in the top-left header.