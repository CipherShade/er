import { Role, SessionStatus, ShiftStatus } from '../constants/index.js';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    messageEn?: string;
    details?: unknown;
  };
}

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  preferredLanguage: string;
}

export interface ActiveShiftSummary {
  id: string;
  deskIdentifier: string;
  openedAt: string;
  openingCash: number;
  status: ShiftStatus;
}

export interface LoginResponseData {
  user: AuthUser;
  activeShift: ActiveShiftSummary | null;
}

export interface SessionCardItem {
  id: string;
  title: string;
  academicStage: string;
  teacher: {
    id: string;
    fullName: string;
    subject: string;
  };
  room: {
    id: string;
    name: string;
    capacity: number;
  };
  startTime: string;
  endTime: string;
  sessionPrice: number;
  centerFeePerStudent: number;
  currentLobbyCount: number;
  status: SessionStatus;
}

export interface StudentLookupItem {
  id: string;
  studentCode: string;
  fullName: string;
  studentPhone: string | null;
  guardianPhone: string;
  academicStage: string;
  schoolType: string;
}
