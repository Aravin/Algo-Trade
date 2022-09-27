import { Button, Space, Table, Tag } from 'antd';
import React, { useState } from 'react';
import { EditOutlined, DeleteOutlined } from '@ant-design/icons';

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
    symbol: 'NIFTY',
    broker: 'Finvasia',
    lots: 100,
    batches: 1,
    entryTime: '10:45',
    entryInterval: 2,
    exitTime: '11:20',
    exitInterval: 2,
    stopLoss: 5,
    trailRange: 0,
    trailStopLoss: 0,
    selectedDays: 'M,T,W,T,F',
    status: 'Active',
  },
  {
    key: '2',
    symbol: 'NIFTY',
    broker: 'Finvasia',
    lots: 50,
    batches: 1,
    entryTime: '10:45',
    entryInterval: 2,
    exitTime: '11:20',
    exitInterval: 2,
    stopLoss: 5,
    trailRange: 0,
    trailStopLoss: 0,
    selectedDays: 'M,T,W,T,F',
    status: 'Active',
  },
  {
    key: '3',
    symbol: 'NIFTY',
    broker: 'Finvasia',
    lots: 750,
    batches: 1,
    entryTime: '10:45',
    entryInterval: 2,
    exitTime: '11:20',
    exitInterval: 2,
    stopLoss: 5,
    trailRange: 0,
    trailStopLoss: 0,
    selectedDays: 'M,T,W,T,F',
    status: 'Active',
  },
];

const Dashboard: React.FC = () => {

  return (

    <div>
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" className='bg-blue-500'>
          Add New Strategies
        </Button>
        
      </div>
      <Table  dataSource={data}>
        <Column title="Symbol" dataIndex="symbol" key="symbol" />
        <Column title="Broker" dataIndex="broker" key="broker" />
        <Column title="Lots" dataIndex="lots" key="lots" />
        <Column title="Batches" dataIndex="batches" key="batches" />
        <Column title="Entry(time)" dataIndex="entryTime" key="entryTime" />
        <Column title="Entry(interval)" dataIndex="entryInterval" key="entryInterval" />
        <Column title="Exit(time)" dataIndex="exitTime" key="exitTime" />
        <Column title="Exit(interval)" dataIndex="exitInterval" key="exitInterval" />
        <Column title="SL(%)" dataIndex="stopLoss" key="stopLoss" />
        <Column title="trail(x)" dataIndex="trailRange" key="trailRange" />
        <Column title="trailSL(y)" dataIndex="trailStopLoss" key="trailStopLoss" />
        <Column title="selectedDays" dataIndex="selectedDays" key="selectedDays" />
        <Column title="status" dataIndex="status" key="status" />

        <Column
          title="Action"
          key="action"
          render={(_: any, record: DataType) => (
            <Space size="middle">
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
