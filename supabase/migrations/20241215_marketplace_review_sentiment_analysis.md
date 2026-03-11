# Build Marketplace Review Sentiment Analysis

```markdown
# Marketplace Review Sentiment Analysis Migration Documentation

## Purpose
This SQL migration script sets up the necessary database schema for performing sentiment analysis on marketplace reviews. It enables models to analyze sentiment, store results, and assess the helpfulness of reviews.

## Usage
This SQL file can be executed in a PostgreSQL environment to create the required tables for sentiment analysis of marketplace reviews. Ensure that the database is configured to allow UUID generation and that the necessary extensions are enabled.

## Parameters / Props
1. **sentiment_analysis_models**: 
   - Stores configurations for different sentiment analysis models.
   - **id**: UUID - Unique identifier for the model.
   - **name**: VARCHAR(255) - Name of the model.
   - **version**: VARCHAR(50) - Version number of the model.
   - **model_type**: VARCHAR(100) - Type of model (e.g., 'transformer', 'lstm', 'naive_bayes').
   - **config**: JSONB - Configuration parameters for the model.
   - **accuracy_metrics**: JSONB - Metrics for evaluating model performance.
   - **is_active**: BOOLEAN - Indicates if the model is currently active.
   - **created_at**: TIMESTAMP WITH TIME ZONE - Timestamp of creation.
   - **updated_at**: TIMESTAMP WITH TIME ZONE - Timestamp of the last update.
  
2. **review_sentiment_analysis**:
   - Stores results from sentiment analysis performed on reviews.
   - **id**: UUID - Unique identifier for the analysis result.
   - **review_id**: UUID - Identifier of the review being analyzed.
   - **model_id**: UUID - Identifier referencing the sentiment analysis model used.
   - **sentiment_score**: DECIMAL(3,2) - Score representing the sentiment (-1 to 1).
   - **sentiment_label**: VARCHAR(20) - Label categorizing sentiment (e.g., 'positive').
   - **confidence_score**: DECIMAL(4,3) - Confidence level associated with the score (0 to 1).
   - **emotion_scores**: JSONB - Scores representing extracted emotions.
   - **keywords_extracted**: JSONB - Key phrases extracted from the review.
   - **sentiment_explanation**: TEXT - Textual explanation of the sentiment.
   - **processing_time_ms**: INTEGER - Time taken for processing the review.
   - **created_at**: TIMESTAMP WITH TIME ZONE - Timestamp of result creation.

3. **review_helpfulness_scores**:
   - Records votes indicating how helpful a review is perceived to be.
   - **id**: UUID - Unique identifier for the helpfulness score.
   - **review_id**: UUID - Identifier of the review.
   - **helpful_votes**: INTEGER - Number of users who found the review helpful.
   - **total_votes**: INTEGER - Total number of votes received.
   - **helpfulness_ratio**: DECIMAL(4,3) - Ratio of helpful votes to total votes.

## Return Values
Executing this migration will create three tables in the database:
- `sentiment_analysis_models`
- `review_sentiment_analysis`
- `review_helpfulness_scores`

These tables will be ready to store and manage sentiment analysis data related to marketplace reviews.

## Examples
- To check on the model configurations:
  ```sql
  SELECT * FROM sentiment_analysis_models;
  ```

- To insert a new review sentiment analysis result:
  ```sql
  INSERT INTO review_sentiment_analysis (review_id, model_id, sentiment_score, sentiment_label, confidence_score, emotion_scores, keywords_extracted, sentiment_explanation, processing_time_ms)
  VALUES ('<review-uuid>', '<model-uuid>', 0.85, 'positive', 0.95, '{"joy": 0.8, "sadness": 0.1}', '["great", "product"]', 'The review expresses a very positive sentiment.', 200);
  ```
```