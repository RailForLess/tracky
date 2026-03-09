export interface TrainActivityProps {
  trainNumber: string;
  routeName: string;
  fromCode: string;
  toCode: string;
  from: string;
  to: string;
  departTime: string;
  arriveTime: string;
  departDelay: number;
  arrivalDelay: number;
  minutesUntilDeparture: number;
  minutesRemaining: number;
  progressFraction: number;
  status: string;
  lastUpdated: number;
}
