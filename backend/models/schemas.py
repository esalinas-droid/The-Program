from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
import uuid


class SetPrescription(BaseModel):
    setNumber: int
    targetReps: Optional[int] = None
    targetLoad: Optional[float] = None
    targetRPE: Optional[float] = None
    isWarmup: bool = False
    notes: Optional[str] = None


class UserProfile(BaseModel):
    userId: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: Optional[str] = None
    goal: str
    experience: str
    currentLifts: Dict[str, float] = Field(default_factory=dict)
    liftUnit: str = "kg"
    bodyweight: Optional[float] = None
    trainingDays: List[str] = Field(default_factory=list)
    injuries: List[str] = Field(default_factory=list)
    gymTypes: List[str] = Field(default_factory=list)
    onboardingComplete: bool = False
    createdAt: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class AnnualPlan(BaseModel):
    planId: str = Field(default_factory=lambda: str(uuid.uuid4()))
    userId: str
    planName: str
    startDate: str
    totalWeeks: int
    phases: List[Dict[str, Any]] = Field(default_factory=list)
    milestones: List[Dict[str, Any]] = Field(default_factory=list)
    status: str = "active"
    generatedAt: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class Phase(BaseModel):
    phaseId: str = Field(default_factory=lambda: str(uuid.uuid4()))
    planId: str
    phaseName: str
    phaseNumber: int
    goal: str
    expectedAdaptation: str
    startWeek: int
    endWeek: int
    status: str = "upcoming"


class Block(BaseModel):
    blockId: str = Field(default_factory=lambda: str(uuid.uuid4()))
    phaseId: str
    blockName: str
    blockNumber: int
    blockGoal: str
    weekCount: int
    progressionLogic: str
    keyExercises: List[str] = Field(default_factory=list)
    status: str = "upcoming"


class SessionExercise(BaseModel):
    sessionExerciseId: str = Field(default_factory=lambda: str(uuid.uuid4()))
    sessionId: str
    exerciseId: str
    name: str
    category: str  # main | supplemental | accessory | event | conditioning
    prescription: str  # human-readable summary e.g. "Work to 5RM"
    targetSets: List[SetPrescription] = Field(default_factory=list)
    notes: Optional[str] = None
    order: int = 0
    loggedSets: List[Dict[str, Any]] = Field(default_factory=list)
    completed: bool = False


class Session(BaseModel):
    sessionId: str = Field(default_factory=lambda: str(uuid.uuid4()))
    blockId: str
    weekNumber: int
    dayNumber: int
    sessionType: str  # ME_LOWER | ME_UPPER | DE_LOWER | DE_UPPER | EVENTS | GPP
    objective: str
    coachNote: str
    exercises: List[Dict[str, Any]] = Field(default_factory=list)
    status: str = "pending"  # pending | active | completed
    completedAt: Optional[str] = None


class Exercise(BaseModel):
    exerciseId: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    movementPattern: str  # squat | hinge | push | pull | carry | explosive
    primaryMuscles: List[str] = Field(default_factory=list)
    secondaryMuscles: List[str] = Field(default_factory=list)
    equipment: str
    cues: List[str] = Field(default_factory=list)
    alternatives: List[str] = Field(default_factory=list)


class LoggedSet(BaseModel):
    loggedSetId: str = Field(default_factory=lambda: str(uuid.uuid4()))
    sessionExerciseId: str
    setNumber: int
    targetLoad: Optional[float] = None
    actualLoad: Optional[float] = None
    targetReps: Optional[int] = None
    actualReps: Optional[int] = None
    actualRPE: Optional[float] = None
    painScore: Optional[int] = None  # 0-10
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class PainEntry(BaseModel):
    painId: str = Field(default_factory=lambda: str(uuid.uuid4()))
    userId: str
    exerciseId: Optional[str] = None
    location: str  # body part
    score: int  # 1-10
    note: Optional[str] = None
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class CoachMemoryFact(BaseModel):
    factId: str = Field(default_factory=lambda: str(uuid.uuid4()))
    userId: str
    factType: str  # injury | preference | pr | feedback | goal_change
    factValue: str
    source: str  # "user" | "system" | "coach"
    confirmed: bool = False
    createdAt: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class ProgramChange(BaseModel):
    changeId: str = Field(default_factory=lambda: str(uuid.uuid4()))
    userId: str
    triggerType: str  # pain | fatigue | plateau | user_request | phase_transition
    scope: str  # session | block | phase | plan
    oldValue: Optional[str] = None
    newValue: Optional[str] = None
    explanation: str
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class WorkoutLog(BaseModel):
    logId: str = Field(default_factory=lambda: str(uuid.uuid4()))
    userId: str
    sessionId: str
    completedSets: int
    totalSets: int
    duration: Optional[int] = None  # minutes
    completedAt: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class ProgressMetric(BaseModel):
    metricId: str = Field(default_factory=lambda: str(uuid.uuid4()))
    userId: str
    exerciseId: str
    type: str  # 1rm | volume_pr | rep_pr
    value: float
    date: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


# ===== API REQUEST / RESPONSE MODELS =====

class IntakeRequest(BaseModel):
    name: str
    email: Optional[str] = None
    goal: str
    experience: str
    currentLifts: Dict[str, float] = Field(default_factory=dict)
    liftUnit: str = "kg"
    bodyweight: Optional[float] = None
    trainingDays: List[str] = Field(default_factory=list)
    injuries: List[str] = Field(default_factory=list)
    gymTypes: List[str] = Field(default_factory=list)


class IntakeResponse(BaseModel):
    userId: str
    profile: UserProfile
    plan: Dict[str, Any]
    message: str


class LogSetRequest(BaseModel):
    sessionId: str
    sessionExerciseId: str
    setNumber: int
    actualLoad: Optional[float] = None
    actualReps: Optional[int] = None
    actualRPE: Optional[float] = None
    painScore: Optional[int] = None
    notes: Optional[str] = None


class FinishSessionRequest(BaseModel):
    sessionId: str
    duration: Optional[int] = None
    notes: Optional[str] = None


class AdjustExerciseRequest(BaseModel):
    sessionId: str
    sessionExerciseId: str
    reason: str  # pain | fatigue | equipment | preference
