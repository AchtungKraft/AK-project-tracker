import React from 'react';
import { useIsMobile } from './useIsMobile';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * MobileMetricPriorityGrid
 * Improves scan speed for inventory and task metrics on mobile.
 * 
 * Props:
 * - metrics: [{ key, label, value, icon, color, emphasis }]
 * - primaryMetricKey: string - Key of the metric to display prominently on mobile
 */
export default function MobileMetricPriorityGrid({ 
  metrics = [],
  primaryMetricKey,
  className = ''
}) {
  const isMobile = useIsMobile();

  if (!metrics.length) return null;

  const primaryMetric = primaryMetricKey 
    ? metrics.find(m => m.key === primaryMetricKey) 
    : metrics[0];
  const secondaryMetrics = metrics.filter(m => m.key !== primaryMetric?.key);

  // Mobile Layout: Primary metric full width, others in 2-col grid
  if (isMobile) {
    return (
      <div className={cn('space-y-3', className)}>
        {/* Primary Metric - Full Width */}
        {primaryMetric && (
          <MetricCard metric={primaryMetric} isPrimary size="large" />
        )}
        
        {/* Secondary Metrics - 2 Column Grid */}
        {secondaryMetrics.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {secondaryMetrics.map(metric => (
              <MetricCard key={metric.key} metric={metric} size="small" />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Desktop Layout: Standard grid
  return (
    <div className={cn('grid grid-cols-2 md:grid-cols-4 gap-3', className)}>
      {metrics.map(metric => (
        <MetricCard key={metric.key} metric={metric} />
      ))}
    </div>
  );
}

/**
 * MetricCard - Individual metric display card
 */
function MetricCard({ metric, isPrimary = false, size = 'default' }) {
  const Icon = metric.icon;
  const colorClasses = getColorClasses(metric.color);

  return (
    <Card className={cn(
      'bg-gray-900/50 border-gray-700',
      isPrimary && 'border-red-900/50 bg-red-950/20'
    )}>
      <CardContent className={cn(
        'flex items-center gap-3',
        size === 'large' ? 'p-4' : size === 'small' ? 'p-3' : 'p-4'
      )}>
        {Icon && (
          <div className={cn(
            'rounded-lg flex items-center justify-center',
            size === 'large' ? 'w-12 h-12' : 'w-8 h-8',
            colorClasses.bg
          )}>
            <Icon className={cn(
              colorClasses.text,
              size === 'large' ? 'w-6 h-6' : 'w-4 h-4'
            )} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className={cn(
            'font-bold',
            size === 'large' ? 'text-2xl' : size === 'small' ? 'text-lg' : 'text-xl',
            isPrimary ? 'text-white' : 'text-gray-100'
          )}>
            {metric.value}
          </p>
          <p className={cn(
            'text-gray-400 truncate',
            size === 'small' ? 'text-xs' : 'text-sm'
          )}>
            {metric.label}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function getColorClasses(color) {
  const colors = {
    red: { bg: 'bg-red-900/30', text: 'text-red-400' },
    green: { bg: 'bg-green-900/30', text: 'text-green-400' },
    blue: { bg: 'bg-blue-900/30', text: 'text-blue-400' },
    yellow: { bg: 'bg-yellow-900/30', text: 'text-yellow-400' },
    orange: { bg: 'bg-orange-900/30', text: 'text-orange-400' },
    purple: { bg: 'bg-purple-900/30', text: 'text-purple-400' },
    gray: { bg: 'bg-gray-800', text: 'text-gray-400' },
  };
  return colors[color] || colors.gray;
}

/**
 * MobileStatBadge - Compact inline stat display
 */
export function MobileStatBadge({ label, value, color = 'gray', className = '' }) {
  const colorClasses = getColorClasses(color);
  
  return (
    <div className={cn(
      'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs',
      colorClasses.bg,
      className
    )}>
      <span className={colorClasses.text}>{value}</span>
      <span className="text-gray-400">{label}</span>
    </div>
  );
}