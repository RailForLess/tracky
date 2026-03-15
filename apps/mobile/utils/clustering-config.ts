/**
 * Shared clustering configuration for map markers
 * Used by both station and train clustering
 */

export const ClusteringConfig = {
  // Latitude delta threshold below which items are shown individually (not clustered)
  // Lower value = more zoomed in before individual items appear
  stationClusterThreshold: 5.0,
  trainClusterThreshold: 2.0,

  // Multiplier for cluster distance calculation
  // clusterDistance = latitudeDelta * multiplier
  clusterDistanceMultiplier: 0.1,

  // Latitude delta threshold for showing full names vs abbreviations
  fullNameThreshold: 1.0,
};
