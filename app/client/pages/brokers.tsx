import { Button, Space, Table, Tag } from 'antd';
import React, { useState } from 'react';
import { EditOutlined, DeleteOutlined, ApiOutlined } from '@ant-design/icons';

const { Column, ColumnGroup } = Table;

interface DataType {
  key: React.Key;
  firstName: string;
  lastName: string;
  age: number;
  address: string;
  tags: string[];
}

const data: any[] = [
  {
    key: '1',
    broker: 'Finvasia',
    clientId: '24343',
    status: 'Connected',
  },
  {
    key: '2',
    broker: 'ICICI Direct',
    clientId: '24343',
    status: 'Connected',
  },
  {
    key: '3',
    broker: 'Zerodha',
    clientId: '24343',
    status: 'Connected',
  },
];

const Dashboard: React.FC = () => {

  return (

    <div>
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" className='bg-blue-500'>
          Add New Broker
        </Button>
        
      </div>
      <Table  dataSource={data}>
        <Column title="Broker" dataIndex="broker" key="broker" />
        <Column title="ClientId" dataIndex="clientId" key="clientId" />
        <Column title="Status" dataIndex="status" key="status" />

        <Column
          title="Action"
          key="action"
          render={(_: any, record: DataType) => (
            <Space size="middle">
              <a className='text-blue-500'> <ApiOutlined/> </a>
              <a className='text-blue-500'> <EditOutlined/> </a>
              <a className='text-red-500'> <DeleteOutlined/> </a>
            </Space>
          )}
        />
      </Table>
    </div>

  )
};

export default Dashboard;
