"""
The Program — Core Data Models
Pydantic schemas for MongoDB collections
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from datetime import datetime
from enum import Enum


# ─── Enums ────────────────────────────────────────────────────────────────────

class GoalType(str, Enum):
    STRENGTH = "Strength"
    HYPERTROPHY = "Hypertrophy"
    POWERLIFTING = "Powerlifting"
    STRONGMAN = "Strongman"
    ATHLETIC = "Athletic Performance"
    GENERAL = "General Fitness"

class ExperienceLevel(str, Enum):
    BEGINNER = "Beginner"
    INTERMEDIATE = "Intermediate"
    ADVANCED = "Advanced"
    ELITE = "Elite"

class SessionType(str, Enum):
    ME_UPPER = "Max Effort Upper"
    ME_LOWER = "Max Effort Lower"
    DE_UPPER = "Dynamic Effort Upper"
    DE_LOWER = "Dynamic Effort Lower"
    RE_UPPER = "Repetition Upper"
    RE_LOWER = "Repetition Lower"
    GPP = "GPP / Recovery"
    FULL_BODY = "Full Body"
    EVENT_TRAINING = "Event Training"

class ExerciseCategory(str, Enum):
    MAIN = "main"
    SUPPLEMENTAL = "supplemental"
    ACCESSORY = "accessory"
    PREHAB = "prehab"

class MovementPattern(str, Enum):
    PUSH = "Push"
    PULL = "Pull"
    HINGE = "Hinge"
    SQUAT = "Squat"
    CARRY = "Carry"
    ISOLATION = "Isolation"
    CORE = "Core"

class PhaseStatus(str, Enum):
    UPCOMING = "upcoming"
    CURRENT = "current"
    COMPLETED = "completed"

class SessionStatus(str, Enum):
    PLANNED = "planned"
    IN_PROGRESS = "inProgress"
    COMPLETED = "completed"
    SKIPPED = "skipped"

class ChangeScope(str, Enum):
    DAY = "day"
    BLOCK = "block"
    YEAR = "year"

class ChangeTrigger(str, Enum):
    PAIN = "pain"
    READINESS = "readiness"
    MISSED_SESSION = "missedSession"
    UPLOAD = "upload"
    CHAT = "chat"
    PERFORMANCE = "performance"
    USER_REQUEST = "userRequest"


# ─── Lift Data ────────────────────────────────────────────────────────────────

class CurrentLifts(BaseModel):
    squat: Optional[int] = None
    bench: Optional[int] = None
    deadlift: Optional[int] = None
    ohp: Optional[int] = None


# ─── User Profile ─────────────────────────────────────────────────────────────

class UserProfile(BaseModel):
    userId: str = Field(default_factory=lambda: str(datetime.now().timestamp()).replace(".", ""))
    name: Optional[str] = None
    email: Optional[str] = None
    goal: GoalType = GoalType.STRENGTH
    secondaryGoal: Optional[str] = None
    experience: ExperienceLevel = ExperienceLevel.INTERMEDIATE
    currentLifts: CurrentLifts = CurrentLifts()
    liftUnit: str = "lbs"
    bodyweight: Optional[float] = None
    trainingDays: int = 4
    injuries: List[str] = []
    gymTypes: List[str] = []
    equipmentAccess: List[str] = []
    competitionDates: List[str] = []
    preferences: Dict = {}
    onboardingComplete: bool = False
    createdAt: datetime = Field(default_factory=datetime.now)
    updatedAt: datetime = Field(default_factory=datetime.now)


# ─── Exercise ─────────────────────────────────────────────────────────────────

class ExerciseAlternative(BaseModel):
    name: str
    reason: str  # pain, equipment, travel, preference
    explanation: str

class Exercise(BaseModel):
    exerciseId: str = ""
    name: str
    movementPattern: MovementPattern
    primaryMuscles: List[str] = []
    secondaryMuscles: List[str] = []
    equipment: str = "Barbell"
    jointStressTags: List[str] = []
    contraindications: List[str] = []
    indoorOutdoor: str = "indoor"
    skillLevel: str = "intermediate"
    cues: List[str] = []
    commonMistakes: List[str] = []
    alternatives: List[ExerciseAlternative] = []


# ─── Target Set ───────────────────────────────────────────────────────────────

class TargetSet(BaseModel):
    setNumber: int
    targetLoad: Optional[str] = None  # "225" or "225-245" or "Bar"
    targetReps: str = "1"  # "1" or "6-8" or "AMRAP"
    setType: str = "work"  # warmup, ramp, work
    targetRPE: Optional[float] = None


# ─── Session Exercise ─────────────────────────────────────────────────────────

class SessionExercise(BaseModel):
    sessionExerciseId: str = ""
    exerciseId: str = ""
    name: str
    category: ExerciseCategory = ExerciseCategory.MAIN
    prescription: str = ""  # "4x6-8" display string
    targetSets: List[TargetSet] = []
    order: int = 0
    notes: str = ""
    cues: List[str] = []
    lastPerformance: str = ""
    recentBest: str = ""
    adjustedFrom: Optional[str] = None
    adjustmentReason: Optional[str] = None


# ─── Warmup Protocol ──────────────────────────────────────────────────────────

class WarmupProtocol(BaseModel):
    label: str = "Warm-Up Protocol"
    duration: str = "8-10 min"
    steps: List[str] = []


# ─── Session ──────────────────────────────────────────────────────────────────

class Session(BaseModel):
    sessionId: str = ""
    blockId: str = ""
    weekNumber: int = 1
    dayNumber: int = 1
    sessionType: SessionType = SessionType.ME_UPPER
    objective: str = ""
    coachNote: str = ""
    exercises: List[SessionExercise] = []
    warmup: WarmupProtocol = WarmupProtocol()
    status: SessionStatus = SessionStatus.PLANNED
    startedAt: Optional[datetime] = None
    completedAt: Optional[datetime] = None


# ─── Week ─────────────────────────────────────────────────────────────────────

class Week(BaseModel):
    weekId: str = ""
    blockId: str = ""
    weekNumber: int = 1
    sessions: List[Session] = []
    isDeload: bool = False
    isTest: bool = False
    compliance: float = 0.0
    avgRPE: float = 0.0
    status: PhaseStatus = PhaseStatus.UPCOMING


# ─── Block ────────────────────────────────────────────────────────────────────

class Block(BaseModel):
    blockId: str = ""
    phaseId: str = ""
    blockName: str = ""
    blockNumber: int = 1
    blockGoal: str = ""
    weekCount: int = 4
    startDate: Optional[str] = None
    endDate: Optional[str] = None
    progressionLogic: str = ""
    riskAreas: List[str] = []
    keyExercises: List[str] = []
    weeks: List[Week] = []
    status: PhaseStatus = PhaseStatus.UPCOMING


# ─── Phase ────────────────────────────────────────────────────────────────────

class Phase(BaseModel):
    phaseId: str = ""
    planId: str = ""
    phaseName: str = ""
    phaseNumber: int = 1
    goal: str = ""
    expectedAdaptation: str = ""
    startWeek: int = 1
    endWeek: int = 4
    blocks: List[Block] = []
    status: PhaseStatus = PhaseStatus.UPCOMING


# ─── Milestone ────────────────────────────────────────────────────────────────

class Milestone(BaseModel):
    name: str
    targetDate: str = ""
    targetValue: str = ""
    achieved: bool = False


# ─── Annual Plan ──────────────────────────────────────────────────────────────

class AnnualPlan(BaseModel):
    planId: str = ""
    userId: str = ""
    planName: str = ""
    startDate: str = ""
    totalWeeks: int = 52
    trainingDays: int = 4     # days/week — set from intake.frequency
    phases: List[Phase] = []
    milestones: List[Milestone] = []
    deloadWeeks: List[int] = []
    testingWeeks: List[int] = []
    status: str = "active"
    generatedAt: datetime = Field(default_factory=datetime.now)
    lastModified: datetime = Field(default_factory=datetime.now)


# ─── Logged Set ───────────────────────────────────────────────────────────────

class LoggedSet(BaseModel):
    loggedSetId: str = ""
    sessionExerciseId: str = ""
    setNumber: int = 1
    targetLoad: Optional[float] = None
    actualLoad: Optional[float] = None
    targetReps: Optional[int] = None
    actualReps: Optional[int] = None
    targetRPE: Optional[float] = None
    actualRPE: Optional[float] = None
    painScore: int = 0  # 0-4
    painLocation: Optional[str] = None
    painNote: Optional[str] = None
    modified: bool = False
    skipped: bool = False
    substitutionReason: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.now)


# ─── Pain Entry ───────────────────────────────────────────────────────────────

class PainEntry(BaseModel):
    painId: str = ""
    userId: str = ""
    exerciseId: Optional[str] = None
    sessionId: Optional[str] = None
    location: str = ""
    score: int = 0  # 0=none, 1=aware, 2=mild, 3=modify, 4=stop
    painType: Optional[str] = None
    isNew: bool = True
    note: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.now)


# ─── Coach Memory Fact ────────────────────────────────────────────────────────

class CoachMemoryFact(BaseModel):
    factId: str = ""
    userId: str = ""
    factType: str = ""  # injury, preference, history, restriction, equipment
    factValue: str = ""
    confidence: float = 0.8
    source: str = "onboarding"  # onboarding, upload, chat, log, pain
    confirmed: bool = False
    lastUsedDate: Optional[datetime] = None
    createdAt: datetime = Field(default_factory=datetime.now)


# ─── Program Change ──────────────────────────────────────────────────────────

class ProgramChange(BaseModel):
    changeId: str = ""
    userId: str = ""
    timestamp: datetime = Field(default_factory=datetime.now)
    triggerType: ChangeTrigger = ChangeTrigger.USER_REQUEST
    scope: ChangeScope = ChangeScope.DAY
    oldValue: str = ""
    newValue: str = ""
    explanation: str = ""
    userVisible: bool = True
    affectedSessionIds: List[str] = []


# ─── Workout Log ──────────────────────────────────────────────────────────────

class WorkoutLog(BaseModel):
    logId: str = ""
    userId: str = ""
    sessionId: str = ""
    completedSets: int = 0
    totalSets: int = 0
    duration: int = 0  # minutes
    completedAt: datetime = Field(default_factory=datetime.now)
    wins: List[str] = []
    flags: List[str] = []
    coachReviewNote: str = ""


# ─── Progress Metric ──────────────────────────────────────────────────────────

class ProgressMetric(BaseModel):
    metricId: str = ""
    userId: str = ""
    exerciseId: Optional[str] = None
    metricType: str = "pr"  # pr, e1rm, volume, compliance, bodyweight
    value: float = 0.0
    unit: str = "lbs"
    date: datetime = Field(default_factory=datetime.now)


# ─── API Request/Response Models ──────────────────────────────────────────────

class IntakeRequest(BaseModel):
    goal: str
    experience: str
    lifts: CurrentLifts = CurrentLifts()
    liftUnit: str = "lbs"
    frequency: int = 4
    injuries: List[str] = []
    gym: List[str] = []
    bodyweight: Optional[float] = None
    # Extended intake fields (Phase 2)
    primaryWeaknesses: List[str] = []
    specialtyEquipment: List[str] = []
    sleepHours: Optional[float] = None
    stressLevel: Optional[str] = None
    occupationType: Optional[str] = None
    hasCompetition: bool = False
    competitionDate: Optional[str] = None
    competitionType: Optional[str] = None
    name: Optional[str] = None

class LogSetRequest(BaseModel):
    sessionExerciseId: str
    setNumber: int
    actualLoad: Optional[float] = None
    actualReps: Optional[int] = None
    actualRPE: Optional[float] = None
    painScore: int = 0
    painLocation: Optional[str] = None
    painNote: Optional[str] = None

class AdjustExerciseRequest(BaseModel):
    exerciseId: str
    exerciseName: str
    reason: str  # pain, equipment, travel, preference, crowded, fatigue

class FinishSessionRequest(BaseModel):
    sessionId: str

class PostWorkoutReview(BaseModel):
    sessionId: str
    completedSets: int
    totalSets: int
    duration: int
    wins: List[str] = []
    flags: List[str] = []
    coachNote: str = ""
    whatsNext: str = ""
