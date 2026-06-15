export type TransportType = "PUBLIC" | "CAR";

export interface ParticipantOrigin {
  participantId: number;
  participantName: string;
  latitude: number;
  longitude: number;
  transportType: TransportType;
}

export interface SeoulHub {
  name: string;
  category: string;
  address: string;
  latitude: number;
  longitude: number;
}

export interface ParticipantTravel {
  participantId: number;
  participantName: string;
  minutes: number;
  transportType: TransportType;
}

export interface RankedPlace extends SeoulHub {
  rank: number;
  averageMinutes: number;
  maxMinutes: number;
  standardDeviation: number;
  fairnessScore: number;
  memberTravels: ParticipantTravel[];
}

