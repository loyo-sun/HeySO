import {SidebarContext} from './SidebarContext.jsx';
import React,{Children,createContext,forwardRef,isValidElement,useContext,useEffect,useImperativeHandle,useId,useMemo,useRef,useState} from 'react';
import {Button,Checkbox,ColorPicker,DatePicker,Drawer,Form,Input,InputNumber,Modal,Radio,Select as AntSelect,Tooltip,Upload as AntUpload} from 'antd';
import {Calendar,ChevronDown,ChevronsUpDown,X} from 'lucide-react';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
dayjs.locale('zh-cn');

const FormContext=createContext(null);
const eventFor=(value,name)=>({target:{value,name},currentTarget:{value,name}});
function ButtonText({children}){return children;}
const hasText=children=>Children.toArray(children).some(c=>typeof c==='string'?!!c.trim():typeof c==='number'||(isValidElement(c)&&hasText(c.props.children)));
export function SidebarTip({children,label,description,always}){const compact=useContext(SidebarContext);if(!label||(!compact&&!always))return children;return <Tooltip title={<div className="sidebar-tooltip"><strong>{label}</strong>{description&&<span>{description}</span>}</div>} placement="right" arrow={false} classNames={{root:'heyso-sidebar-tip'}}>{children}</Tooltip>;}
export const ReplicaButton=forwardRef(function ReplicaButton({type='submit',children,className='',title,...props},ref){
 const button=<Button {...props} aria-label={props['aria-label']??(!hasText(children)?title:undefined)} ref={ref} htmlType={type} className={`replica-button ${className}`}>{Children.map(children,c=>typeof c==='string'||typeof c==='number'?<ButtonText>{c}</ButtonText>:c)}</Button>;
 const content=title&&!props['data-sidebar-tooltip']?<Tooltip title={title} mouseEnterDelay={.5} classNames={{root:'heyso-button-tip'}}>{button}</Tooltip>:button;
 return <SidebarTip label={props['data-sidebar-tooltip']} description={props['data-sidebar-description']} always={props['data-tooltip-always']}>{content}</SidebarTip>;
});


export const BindField=forwardRef(function BindField({name,value,required,pattern,minLength,maxLength,label,checked,disabled,type,children,...triggerProps},ref){
 const childRef=isValidElement(children)?children.props.ref:undefined;
 const controlRef=useMemo(()=>ref&&childRef?node=>{for(const target of [childRef,ref]){if(typeof target==='function')target(node);else target.current=node;}}:ref||childRef,[ref,childRef]);
 const control=isValidElement(children)?React.cloneElement(children,{...triggerProps,...(triggerProps.className?{className:[children.props.className,triggerProps.className].filter(Boolean).join(' ')}:{}),...(controlRef?{ref:controlRef}:{})}):children;
 const context=useContext(FormContext),form=context?.form;
 useEffect(()=>{if(form&&name&&value!==undefined)form.setFieldValue(name,value);},[form,name,value]);
 if(!form||!name)return control;
 const rules=[...(checked&&required&&!disabled?[{validator:(_,v)=>v===true?Promise.resolve():Promise.reject(new Error('请先确认此项'))}]:[]),...(['email','url'].includes(type)?[{type,message:'请输入有效的'+(type==='email'?'邮箱':'链接')}]:[]),...(required&&!disabled?[{required:true,message:`请填写${label||'此项'}`}]:[]),...(pattern?[{pattern:new RegExp(pattern),message:'格式不符合要求'}]:[]),...(minLength?[{min:Number(minLength),message:`至少 ${minLength} 个字符`}]:[]),...(maxLength?[{max:Number(maxLength),message:`最多 ${maxLength} 个字符`}]:[])];
 return <Form.Item name={name} noStyle initialValue={value} rules={rules} valuePropName={checked?'checked':'value'} getValueFromEvent={e=>e?.target?(checked?e.target.checked:e.target.value):e}>{control}</Form.Item>;
});
export const ReplicaForm=forwardRef(function ReplicaForm({onSubmit,children,className='',...props},ref){
 const [form]=Form.useForm(),root=useRef(null);useImperativeHandle(ref,()=>root.current?.nativeElement);
 return <FormContext.Provider value={{form}}><Form {...props} className={`heyso-form ${className}`} ref={root} form={form} layout="vertical" requiredMark={false} colon={false} scrollToFirstError
 onFinish={()=>onSubmit?.({preventDefault(){},stopPropagation(){},currentTarget:root.current?.nativeElement,target:root.current?.nativeElement})}>{children}</Form></FormContext.Provider>;
});
export function ReplicaField({children,className='field',...props}){
 const id=useId(),nodes=Children.toArray(children),first=nodes[0],hasLabel=isValidElement(first)&&first.type==='span',content=hasLabel?nodes.slice(1):nodes,control=content.find(c=>isValidElement(c)&&!['small','p','div'].includes(c.type)),controlId=control?.props.id||control?.props.name||id;
 return <Form.Item {...props} className={className} htmlFor={controlId} label={hasLabel?first:undefined} colon={false}>{content.map(c=>c===control?React.cloneElement(c,{id:controlId}):c)}</Form.Item>;
}

export const ReplicaInput=forwardRef(function ReplicaInput({type='text',className='',value,defaultValue,onChange,onInput,name,required,pattern,minLength,maxLength,min,max,step,...props},ref){
 const formContext=useContext(FormContext),[local,setLocal]=useState(defaultValue??''),current=value===undefined?local:value,inner=useRef(null);
 useImperativeHandle(ref,()=>inner.current?.input||inner.current?.nativeElement?.querySelector?.('input')||inner.current);
 const change=next=>{if(value===undefined)setLocal(next);const e=eventFor(next,name);onInput?.(e);onChange?.(e);};
 if(type==='hidden'||type==='file')return <input {...props} ref={ref} type={type} name={name} value={value} defaultValue={defaultValue} onChange={onChange} required={required}/>;
 const bind={name:name||(props.id?['__ui',props.id]:undefined),required,pattern,minLength,maxLength,type,disabled:props.disabled,label:props['aria-label']};
 if(type==='checkbox'||type==='radio'){const Control=type==='checkbox'?Checkbox:Radio;return <BindField {...bind} value={props.checked??props.defaultChecked} checked><Control {...props} ref={inner} name={name} value={value} onChange={onChange} className={`replica-choice ${className}`}/></BindField>;}
 if(type==='date'||type==='datetime-local'){
  const format=type==='date'?'YYYY-MM-DD':'YYYY-MM-DDTHH:mm:ss',date=current&&dayjs(current).isValid()?dayjs(current):null;
  return <><BindField {...bind} value={date}><DatePicker {...props} ref={inner} className={`heyso-date ${date?'is-filled':''} ${className}`} data-filled={!!date} value={date} format={type==='date'?'YYYY/MM/DD':'YYYY/MM/DD HH:mm:ss'} showTime={type==='datetime-local'} placeholder={type==='date'?'年/月/日':'年/月/日 时:分:秒'} minDate={min?dayjs(min):undefined} maxDate={max?dayjs(max):undefined} allowClear={false} suffix={<Calendar size={14}/>} onKeyDown={e=>{if(e.key==='Enter')e.preventDefault();props.onKeyDown?.(e);}} onChange={d=>change(d?d.format(format):'')}/></BindField>{name&&<input type="hidden" name={name} value={current||''} disabled={props.disabled}/>}</>;
 }
 if(type==='number')return <><BindField {...bind} value={current===''?null:Number(current)}><InputNumber {...props} ref={inner} className={`heyso-number ${className}`} value={current===''?null:Number(current)} min={min===undefined?undefined:Number(min)} max={max===undefined?undefined:Number(max)} step={step==='any'?undefined:step} onChange={n=>change(n===null?'':String(n))}/></BindField>{name&&<input type="hidden" name={name} value={current} disabled={props.disabled}/>}</>;
 if(type==='color')return <><BindField {...bind} value={current||'#f5642e'}><ColorPicker {...props} className={`heyso-color ${className}`} value={current||'#f5642e'} disabledAlpha onChange={c=>change(c.toHexString())} showText={false}/></BindField>{name&&<input type="hidden" name={name} value={current} disabled={props.disabled}/>}</>;
 return <BindField {...bind} value={current}><Input {...props} ref={inner} type={type} name={name} required={!formContext&&required} pattern={pattern} minLength={minLength} maxLength={maxLength} className={`replica-input ${className}`} value={current} onChange={e=>{if(value===undefined)setLocal(e.target.value);onChange?.(e);}} onInput={onInput}/></BindField>;
});
export const ReplicaTextArea=forwardRef(function ReplicaTextArea({className='',name,value,defaultValue,required,...props},ref){
 const inner=useRef(null);useImperativeHandle(ref,()=>inner.current?.resizableTextArea?.textArea);
 return <BindField name={name||(props.id?['__ui',props.id]:undefined)} value={value??defaultValue} required={required}><Input.TextArea {...props} name={name} required={required} value={value} defaultValue={defaultValue} ref={inner} className={`replica-input ${className}`}/></BindField>;
});
export function ReplicaNativeSelect({children,value,defaultValue,onChange,name,className='',required,...props}){
 const options=Children.toArray(children).map(c=>({value:String(c.props.value??c.props.children),label:c.props.children,disabled:c.props.disabled}));
 const [local,setLocal]=useState(String(defaultValue??options[0]?.value??'')),current=value===undefined?local:String(value);
 return <><BindField name={name} value={current} required={required}><AntSelect {...props} className={`heyso-native-select ${className}`} value={current} options={options} suffix={<ChevronDown size={11}/>} onChange={v=>{setLocal(v);onChange?.(eventFor(v,name));}}/></BindField>{name&&<input type="hidden" name={name} value={current} disabled={props.disabled}/>}</>;
}
function closeAction(children){for(const child of Children.toArray(children)){if(!isValidElement(child))continue;const p=child.props;if((/关闭|取消|继续编辑/.test(p['aria-label']||p.title||'')||p.children==='取消'||p.children==='继续编辑')&&p.onClick)return p.disabled?()=>{}:p.onClick;const nested=closeAction(p.children);if(nested)return nested;}}
export function ReplicaModal({children,className='',role,'aria-modal':ariaModal,...props}){
 const nodes=Children.toArray(children),header=nodes.find(c=>isValidElement(c)&&c.type==='header'),body=nodes.filter(c=>c!==header);
 return <Modal {...props} width={className.includes('unsaved-settings')?440:580} open footer={null} title={header?.props.children} closable={false} getContainer={false} scrollLock={false} zIndex={className.includes('external-link-dialog')?1000:60} onCancel={closeAction(children)} transitionName="" maskTransitionName="" mask={{blur:false}} rootClassName="heyso-modal-root" className="heyso-modal" classNames={{container:className,header:'heyso-modal-header',title:'heyso-modal-title',body:'heyso-modal-body'}}>{body}</Modal>;
}
export function ReplicaDrawer({children,onClose,className='',role,'aria-modal':ariaModal,...props}){
 const nodes=Children.toArray(children),header=nodes.find(c=>isValidElement(c)&&c.type==='header'),body=nodes.find(c=>isValidElement(c)&&c.props.className==='drawer-body'),parts=Children.toArray(header?.props.children);
 return <Drawer {...props} open size={640} getContainer={false} zIndex={40} onClose={onClose} closable={false} rootClassName="heyso-drawer-root" mask={{blur:false}} push={false} title={parts[0]} extra={parts.slice(1)} classNames={{section:className,body:'drawer-body'}}>{body?.props.children}</Drawer>;
}

export function ReplicaUpload({children,className='',onChange,disabled,accept,multiple}){return <AntUpload className="heyso-upload" accept={accept} multiple={multiple} disabled={disabled} showUploadList={false} beforeUpload={(file,files)=>{const target={files:multiple?files:[file],value:''};onChange?.({target,currentTarget:target});return AntUpload.LIST_IGNORE;}}><ReplicaButton type="button" className={className} disabled={disabled}>{children}</ReplicaButton></AntUpload>;}
