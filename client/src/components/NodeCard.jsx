import React from 'react';

const NodeCard = ({ id, name, type, status }) => {
  let statusClass = '';
  if (status === 'Integrated') statusClass = 'status-active';
  if (status === 'PoC Ready') statusClass = 'status-warning';
  if (status === 'Demo Available') statusClass = 'status-active';

  return (
    <div className="node-card">
      <div className="node-card-header">
        <span className="node-id">{id}</span>
        <span className={`status-badge ${statusClass}`}>{status}</span>
      </div>
      <h3 className="node-name">{name}</h3>
      <p className="node-type">{type}</p>
      <div className="node-card-footer">
        <span className="uptime-label">PoC area</span>
        <span className="uptime-value">Public overview</span>
      </div>
    </div>
  );
};

export default NodeCard;
