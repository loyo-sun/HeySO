import React from 'react';
import { ConfigProvider } from 'antd';
import { StyleProvider } from '@ant-design/cssinjs';
import zhCN from 'antd/locale/zh_CN';

export default function ReplicaTheme({ children }) {
  return <StyleProvider layer><ConfigProvider locale={zhCN} button={{ autoInsertSpace: false }} wave={{ disabled: true }} theme={{
    token: { colorPrimary: '#f5642e', colorInfo: '#f5642e', colorSuccess: '#4c8e71', colorWarning: '#b18a3e', colorError: '#d16a50', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif', fontSize: 13, fontSizeSM: 12 },
  }}>{children}</ConfigProvider></StyleProvider>;
}
