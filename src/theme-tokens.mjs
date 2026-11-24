// Shared default palette for workspace controls and host adapters.
// White text remains >=4.5:1 in every enabled primary-button state.
export const brandPalette=Object.freeze({accent:'#c4471b',hover:'#ad3c16',active:'#92320f',onAccent:'#ffffff',accentText:'#b43c15',soft:'#fff0e9'});
export function shellThemeVariables(theme={}){
 const accent=theme.accent||brandPalette.accent,standard=accent===brandPalette.accent;
 return {'--heyso-accent':accent,'--heyso-accent-hover':standard?brandPalette.hover:`color-mix(in srgb, ${accent} 85%, black)`,'--heyso-accent-pressed':standard?brandPalette.active:`color-mix(in srgb, ${accent} 72%, black)`,'--heyso-accent-text':standard?brandPalette.accentText:accent,'--heyso-accent-soft':standard?brandPalette.soft:`color-mix(in srgb, ${accent} 9%, white)`,'--heyso-background':theme.background||'#f7f8fa','--heyso-text':theme.text||'#252525','--heyso-border':theme.border||'#e9e9eb','--heyso-muted':theme.muted||'#85858a'};
}
