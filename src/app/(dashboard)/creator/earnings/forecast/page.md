# Build Creator Earnings Forecasting Dashboard

```markdown
# Creator Earnings Forecasting Dashboard

## Purpose
The Creator Earnings Forecasting Dashboard enables users to visualize and analyze forecasted earnings for content creators. It integrates various data points and trends to help users make informed decisions regarding earnings potential based on multiple scenarios.

## Usage
To use the Creator Earnings Forecasting Dashboard, import the `page.tsx` component into your React application. The dashboard supports interactive features including charts, sliders, and dropdowns to customize the forecasting model based on user-defined input and scenarios.

```tsx
import CreatorEarningsDashboard from './src/app/(dashboard)/creator/earnings/forecast/page';
```

## Parameters/Props

### Component Props
- **EarningsForecastData**: An interface that outlines the structure of earnings forecast data.
    - `date` (string): The date for the forecast.
    - `actual` (number, optional): The actual earnings recorded on that date.
    - `predicted` (number): The predicted earnings for that date.
    - `confidence` (number): Confidence level of the prediction (0-100%).
    - `lowerBound` (number): Lower bound of the prediction range.
    - `upperBound` (number): Upper bound of the prediction range.

- **SeasonalPattern**: An interface representing seasonal influences on earnings.
    - `month` (string): The specific month.
    - `multiplier` (number): Impact of that month on earnings.
    - `confidence` (number): Confidence level for seasonal pattern.

- **MarketFactor**: An interface for various market influences.
    - `name` (string): Name of the market factor.
    - `impact` (number): Impact of the factor on earnings.
    - `trend` ('positive' | 'negative' | 'neutral'): Trend indication.
    - `weight` (number): The weight of this factor in the model.

- **ScenarioConfig**: An interface for customizing scenarios.
    - `releaseSchedule` (number): Number of releases planned.
    - `marketingBudget` (number): Budget allocated for marketing.
    - `collaborations` (number): Number of collaborations planned.
    - `platformGrowth` (number): Expected growth percentage of the platform.
    - `genreTrend` (number): Trend value for the content genre.

- **MLModelMetrics**: Metrics evaluating the performance of the underlying machine learning model.
    - `accuracy` (number): Accuracy percentage of the model.
    - `mse` (number): Mean Squared Error.
    - `mae` (number): Mean Absolute Error.
    - `r2Score` (number): R-squared score indicating model fit.
    - `lastUpdated` (string): Timestamp of the last model update.
    - `trainingDataPoints` (number): Number of training data points used.

## Return Values
The dashboard component displays several visualizations, including:
- Line charts for actual vs. predicted earnings.
- Area charts for seasonal trends.
- Bar charts for market factors.
- Overall metrics including total revenue and average monthly growth.

## Examples

### Basic Usage
```tsx
<CreatorEarningsDashboard />
```

### Custom Scenario Configuration
To customize the earnings forecast using a specific scenario configuration:
```tsx
const scenarioConfig = {
  releaseSchedule: 2,
  marketingBudget: 1000,
  collaborations: 3,
  platformGrowth: 5,
  genreTrend: 4,
};

<CreatorEarningsDashboard scenarioConfig={scenarioConfig} />
```

This documentation outlines how to integrate and utilize the Creator Earnings Forecasting Dashboard, facilitating the analysis and forecasting of creator earnings effectively.
```