import React from 'react';

function NavigationIcon({size=24,children,...props}) {
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>;
}

export function RoadmapNavigationIcon(props) {
 return <NavigationIcon {...props}><rect x="3" y="3" width="11" height="4" rx="1"/><rect x="8" y="10" width="13" height="4" rx="1"/><rect x="3" y="17" width="8" height="4" rx="1"/></NavigationIcon>;
}

export function SmartNavigationIcon(props) {
 return <NavigationIcon {...props}><path d="M12 3C12.4 7.8 16.2 11.6 21 12C16.2 12.4 12.4 16.2 12 21C11.6 16.2 7.8 12.4 3 12C7.8 11.6 11.6 7.8 12 3Z"/></NavigationIcon>;
}
