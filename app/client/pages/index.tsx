import { Button, Space, Table, Tag } from 'antd';
import React, { useState } from 'react';
import { CloseCircleOutlined } from '@ant-design/icons';


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
  },
];

const Dashboard: React.FC = () => {
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [loading, setLoading] = useState(false);

  const start = () => {
    setLoading(true);
    // ajax request after empty completing
    setTimeout(() => {
      setSelectedRowKeys([]);
      setLoading(false);
    }, 1000);
  };

  const onSelectChange = (newSelectedRowKeys: React.Key[]) => {
    console.log('selectedRowKeys changed: ', selectedRowKeys);
    setSelectedRowKeys(newSelectedRowKeys);
  };

  const rowSelection = {
    selectedRowKeys,
    onChange: onSelectChange,
  };
  const hasSelected = selectedRowKeys.length > 0;

  return (

    <div>
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={start} disabled={!hasSelected} loading={loading}>
          Exit
        </Button>
        <span style={{ marginLeft: 8 }}>
          {hasSelected ? `Selected ${selectedRowKeys.length} items` : ''}
        </span>
      </div>
      <Table rowSelection={rowSelection} dataSource={data}>
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

        <Column
          title="Action"
          key="action"
          render={(_: any, record: DataType) => (
            <Space size="middle">
              <a className='text-red-500'> <CloseCircleOutlined/> </a>
            </Space>
          )}
        />
      </Table>
    </div>

  )
};

export default Dashboard;
