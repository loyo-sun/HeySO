import type {ReactNode,ComponentType} from 'react';
export const contractVersion: '1.0.0';
export type SlotId = 'header.brand'|'header.navigation'|'header.project-entry'|'project.selector-actions'|'project.title-actions'|'header.right';
export type ExtensionMode = 'append'|'replace'|'hide';
export interface ProjectSummary {readonly id:string;readonly name:string;readonly code:string;readonly goal:string;readonly longTerm:boolean}
export interface ShellRoute {readonly page:'projects'|'dashboard';readonly projectId:string|null;readonly view:string;readonly settingsSection:string;readonly selected:string|null;readonly tab:'detail'|'children'|'runs'|'history';readonly releaseId:string|null}
export interface NavigationTarget {page?:ShellRoute['page'];projectId?:string;view?:string;settingsSection?:string;selected?:string|null;tab?:ShellRoute['tab'];releaseId?:string|null}
export interface ShellContext {
 readonly projectId:string|null;readonly project:ProjectSummary|null;readonly projects:readonly ProjectSummary[];readonly route:ShellRoute;
 readonly capabilities:Readonly<{busy:boolean;online:boolean;readOnly:boolean;canCreateProject:boolean}>;
 /** Always uses core validation and unsaved-settings protection. */
 navigate(target:NavigationTarget):void;
 /** Run a trusted host-router action only after the same guard has allowed it. */
 requestHostNavigation(callback:()=>void):void;
 openHelp():void;
}
export interface SettingsContext extends ShellContext {/** Report draft changes immediately; cleanup is automatic. */setDirty(dirty:boolean):void}
type Content<C> = {render:(context:C)=>ReactNode;component?:never;node?:never}|{component:ComponentType<C>;render?:never;node?:never}|{node:ReactNode;render?:never;component?:never};
type SlotBase = {id:string;order?:number;when?:(context:ShellContext)=>boolean};
type Hidden = {mode:'hide';render?:never;component?:never;node?:never};
export type SlotExtension = SlotBase & (
  {slot:'header.brand'} & (Content<ShellContext>&{mode:'replace'}|Hidden)
  | {slot:Exclude<SlotId,'header.brand'>} & (Content<ShellContext>&{mode?:'append'|'replace'}|Hidden)
);
export type SettingsExtension = {id:string;order?:number;label?:string;icon?:ComponentType<{size?:number}>}&(Content<SettingsContext>&{mode?:'append'|'replace';label:string}|{mode:'hide';render?:never;component?:never;node?:never});
export interface AppShellExtensions {contractVersion?:'1.0.0';slots?:readonly SlotExtension[];settingsPages?:readonly SettingsExtension[];readOnly?:boolean;theme?:{accent?:string;background?:string;text?:string;border?:string;muted?:string}}
export interface ShellRegistry extends AppShellExtensions {readonly contractVersion:'1.0.0';readonly slots:readonly SlotExtension[];readonly settingsPages:readonly SettingsExtension[]}
export function createShellExtensions(input?:AppShellExtensions):ShellRegistry;
export function mountHeySO(container:HTMLElement,options?:{extensions?:AppShellExtensions}):{unmount():void};
export function HeySOApplication(props:{extensions?:AppShellExtensions}):ReactNode;
export function ShellProvider(props:{extensions:ShellRegistry;children:ReactNode}):ReactNode;
export function ExtensionSlot(props:{id:SlotId;context?:ShellContext;children?:ReactNode}):ReactNode;
export function useShellContext():ShellContext;
export function useOverlayContainer():()=>HTMLElement;
export interface ShellMenuItem {id:string;label:ReactNode;icon?:ReactNode;order?:number;when?:(context:ShellContext)=>boolean;active?:(context:ShellContext)=>boolean;disabled?:(context:ShellContext)=>boolean;onSelect(context:ShellContext):void}
export function ShellMenu(props:{items:readonly ShellMenuItem[];label?:string}):ReactNode;
export const slotDefinitions:Readonly<Record<SlotId,readonly ExtensionMode[]>>;
