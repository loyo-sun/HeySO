import {mountHeySO} from '../../src/extensions/index.jsx';
import {createDemoExtensions} from './extensions.jsx';
const extensions=createDemoExtensions({readOnly:new URLSearchParams(location.search).get('demoReadOnly')==='1',hideMcpSettings:new URLSearchParams(location.search).get('demoHideMcp')==='1'});
import './style.css';
mountHeySO(document.getElementById('root'),{extensions});
