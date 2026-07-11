import React from 'react';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import InfoIcon from '@mui/icons-material/Info';
import SafeMuiIcon from './SafeMuiIcon';

// Stable icon tokens the server writes into SecurityLog.icon. Historical rows
// may still hold legacy emoji (or corrupted mojibake) — those are preserved in
// the database and safely mapped here by token, then type, then severity, so
// nothing ever renders as broken glyphs.
const TOKEN_ICONS = {
  UNLOCK: LockOpenIcon,
  ALERT: ReportProblemIcon,
  DENIED: BlockIcon,
  OK: CheckCircleIcon,
  WARNING: WarningAmberIcon,
  INFO: InfoIcon
};

const TYPE_ICONS = {
  'Gantry Access': LockOpenIcon,
  'Intrusion Alert': ReportProblemIcon,
  'Suspended Access Attempt': BlockIcon,
  'System Online': CheckCircleIcon,
  'System Offline': WarningAmberIcon
};

export const resolveSecurityLogIcon = (log = {}) => {
  const token = String(log.icon || '').trim().toUpperCase();
  if (TOKEN_ICONS[token]) return TOKEN_ICONS[token];
  if (TYPE_ICONS[log.type]) return TYPE_ICONS[log.type];
  return log.severity === 'critical' ? WarningAmberIcon : InfoIcon;
};

const SecurityLogIcon = ({ log, fontSize = 'small', className }) => {
  const selectedIcon = resolveSecurityLogIcon(log);
  return <SafeMuiIcon icon={selectedIcon} fontSize={fontSize} className={className} aria-hidden="true" />;
};

export default SecurityLogIcon;
