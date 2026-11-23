import React from 'react';

// Keep failures local: a rejected lazy import must not unmount the workspace
// (and its drafts). Only an explicit, confirmed refresh replaces the document.
export function recoverableLazy(load, label, errorContent) {
  const Initial = React.lazy(load);
  return class RecoverableModule extends React.Component {
    state = {error: null, View: Initial};
    static getDerivedStateFromError(error) { return {error}; }
    retry = () => this.setState({error: null, View: React.lazy(load)});
    refresh = () => {
      if (window.confirm('刷新页面将丢失尚未保存的编辑内容。请先保存其他区域的内容，确认刷新吗？')) window.location.reload();
    };
    render() {
      if (this.state.error) return <section role="alert" aria-label={`${label}加载失败`}>
        <p>{label}暂时无法加载。网络可能已中断，或应用已更新。其他区域仍可继续使用。</p>
        {errorContent?.(this.props)}
        <button type="button" onClick={this.retry}>重试加载</button>{' '}
        <button type="button" onClick={this.refresh}>刷新页面</button>
        <p>若重试后仍未恢复，请先保存其他编辑内容，再刷新页面。</p>
      </section>;
      const View = this.state.View;
      return <View {...this.props}/>;
    }
  };
}
