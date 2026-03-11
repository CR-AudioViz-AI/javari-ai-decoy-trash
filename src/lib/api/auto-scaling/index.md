# Create Multi-Dimensional Auto-Scaling API

```markdown
# Multi-Dimensional Auto-Scaling API Documentation

## Purpose
The Multi-Dimensional Auto-Scaling API provides functionalities for dynamically scaling resources based on various performance metrics. It can collect metrics, evaluate scaling policies, predict future load, and make scaling decisions to optimize resource utilization.

## Usage
The API can be integrated into applications that require elastic scaling based on real-time metrics. This is particularly useful in cloud environments where resource allocation needs to adjust according to load variations.

## Parameters/Props

### ScalingMetrics
- **timestamp**: `number` - The time at which metrics are collected (not included in returned metrics from `collectSystemMetrics`).
- **cpu_usage**: `number` - The current CPU usage percentage.
- **memory_usage**: `number` - The current memory usage percentage.
- **network_io**: `number` - The network input/output rate.
- **queue_depth**: `number` - The depth of the processing queue.
- **custom_metrics**: `Record<string, number>` - An object storing additional user-defined metrics.
- **instance_count**: `number` - The current number of instances running.

### ScalingPolicy
- **id**: `string` - Unique identifier for the scaling policy.
- **name**: `string` - The name of the scaling policy.
- **min_instances**: `number` - Minimum number of instances to maintain.
- **max_instances**: `number` - Maximum number of instances allowed.
- **target_cpu**: `number` - Target CPU usage percentage to maintain.
- **target_memory**: `number` - Target memory usage percentage.
- **scale_up_threshold**: `number` - CPU or memory usage threshold to trigger scale-up.
- **scale_down_threshold**: `number` - CPU or memory usage threshold to trigger scale-down.
- **cooldown_period**: `number` - Time period to wait after scaling before another scale action can occur.
- **predictive_enabled**: `boolean` - Indicates if predictive scaling is enabled.
- **custom_rules**: `CustomRule[]` - Array of custom rules for scaling actions.

### CustomRule
- **metric**: `string` - The metric associated with this rule.
- **operator**: `'gt' | 'lt' | 'eq'` - Comparison operator for the rule.
- **threshold**: `number` - The value to compare against.
- **action**: `'scale_up' | 'scale_down'` - The action to take if the rule condition is met.
- **weight**: `number` - The importance of this rule in making scaling decisions.

### ScalingDecision
- **action**: `'scale_up' | 'scale_down' | 'no_action'` - The decided scaling action.
- **current_instances**: `number` - Current number of instances.
- **target_instances**: `number` - Recommended number of instances after decision.
- **confidence**: `number` - The confidence level of the scaling decision.
- **reason**: `string` - Explanation for the scaling decision.
- **metrics_snapshot**: `ScalingMetrics` - Collected metrics at decision time.

### PredictionResult
- **predicted_load**: `number` - Forecasted load for the next time period.
- **recommended_instances**: `number` - Suggested number of instances based on prediction.
- **confidence_interval**: `[number, number]` - Confidence interval for the predicted load.
- **time_horizon**: `number` - Time frame for the prediction.

## Examples

### Collect System Metrics
```typescript
const metricsCollector = new MetricsCollector();
const metrics = await metricsCollector.collectSystemMetrics();
console.log(metrics); // { cpu_usage, memory_usage, network_io, queue_depth, custom_metrics, instance_count }
```

### Create Scaling Decision
```typescript
const scalingPolicy: ScalingPolicy = {
  id: 'policy1',
  name: 'High CPU Scale',
  min_instances: 1,
  max_instances: 10,
  target_cpu: 70,
  target_memory: 80,
  scale_up_threshold: 85,
  scale_down_threshold: 50,
  cooldown_period: 300,
  predictive_enabled: true,
  custom_rules: [],
};
```

This API allows users to maintain and optimize resource allocation efficiently based on real-time metrics and predictive analytics.
```