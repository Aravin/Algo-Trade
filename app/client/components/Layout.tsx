import { RobotOutlined, ApiOutlined, DashboardOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { Breadcrumb, Layout, Menu } from 'antd';
import { Footer } from 'antd/lib/layout/layout';
import { useRouter } from 'next/router';
import React, { useState } from 'react';

const { Header, Content, Sider } = Layout;

const items1: MenuProps['items'] = ['Logout'].map(key => ({
  key,
  label: `${key}`,
}));

const items2: MenuProps['items'] = [
  {
    key: `dashboard`,
    icon: React.createElement(DashboardOutlined),
    label: `Dashboard`,
  },
  {
    key: `strategies`,
    icon: React.createElement(RobotOutlined),
    label: `Strategies`,

    children: [
      {
        key: 'strategies',
        label: `Time Based`,
      }
    ],
  },
  {
    key: `brokers`,
    icon: React.createElement(ApiOutlined),
    label: `Brokers`,
  },
]

const AppLayout = ({ children }: any) => {

  const [collapsed, setCollapsed] = useState(false);
  const router = useRouter();

  const toggleCollapsed = () => {
    setCollapsed(!collapsed);
  };

  const menuOnClick = (event: any) => {
    console.log('menu clicked', event);
    router.push(event.key)
  }

  return (
    <Layout className='min-h-screen'>
      <Header className="header" >
        <div className="logo"> <img src='/logo.png'></img> </div>
        <Menu className='flex-row-reverse' theme="dark" mode="horizontal" items={items1} />
      </Header>
      <Layout>
        <Sider breakpoint='lg' collapsedWidth="0" collapsible collapsed={collapsed} onCollapse={value => setCollapsed(value)} width={200} className="site-layout-background">
          <Menu
            mode="inline"
            defaultSelectedKeys={['dashboard']}
            style={{ height: '100%', borderRight: 0 }}
            items={items2}
            onClick={menuOnClick}
            onChange={menuOnClick}
          />
        </Sider>
        <Layout style={{ padding: '0 24px 24px' }}>
          <Breadcrumb style={{ margin: '16px 0' }}>
            <Breadcrumb.Item>Home</Breadcrumb.Item>
            <Breadcrumb.Item>App</Breadcrumb.Item>
          </Breadcrumb>
          <Content
            className="site-layout-background"
            style={{
              padding: 24,
              margin: 0,
              minHeight: 280,
            }}
          >
            {children}
          </Content>
        </Layout>
      </Layout>

      <Footer style={{ textAlign: 'center' }}>Algo Trade © 2022 - Created by Aravin</Footer>
    </Layout>
  )
};

export default AppLayout;
