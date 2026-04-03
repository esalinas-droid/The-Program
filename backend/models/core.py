"""All 14 core Pydantic models for The Program."""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ─── 1. UserProfile ──────────────────────────────────────────────────────────

class CurrentLifts(BaseModel):
    squat:     float = 0.0
    bench:     float = 0.0
    deadlift:  float = 0.0
    ohp:       float = 0.0
    log:       float = 0.0
    axle:      float = 0.0
    yoke:      float = 0.0
    farmers:   float = 0.0   # per hand


class UserProfile(BaseModel):
    userId:            str             = "default"
    name:              str             = ""
    email:             Optional[str]   = None
    goal:              str             = "strength"   # strength/strongman/hypertrophy/athletic/general
    secondaryGoal:     Optional[str]   = None
    experience:        str             = "intermediate"  # beginner/intermediate/advanced/elite
    currentLifts:      CurrentLifts    = Field(default_factory=CurrentLifts)
    liftUnit:          str             = "lbs"
    bodyweight:        float           = 200.0
    trainingDays:      int             = 4
    injuries:          List[str]       = Field(default_factory=list)
    gymTypes:          List[str]       = Field(default_factory=list)
    equipmentAccess:   List[str]       = Field(default_factory=list)
    competitionDates:  List[str]       = Field(default_factory=list)
    preferences:       Dict[str, Any]  = Field(default_factory=dict)
    onboardingComplete: bool           = False
    createdAt:         datetime        = Field(default_factory=_now)
    updatedAt:         datetime        = Field(default_factory=_now)


class UserProfileCreate(BaseModel):
    name:              str
    goal:              str
    experience:        str
    currentLifts:      Optional[Dict[str, float]] = None
    liftUnit:          str                       = "lbs"
    bodyweight:        float                     = 200.0
    trainingDays:      int                       = 4
    injuries:          List[str]                 = Field(default_factory=list)
    gymTypes:          List[str]                 = Field(default_factory=list)
    equipmentAccess:   List[str]                 = Field(default_factory=list)
    competitionDates:  List[str]                 = Field(default_factory=list)
    secondaryGoal:     Optional[str]             = None
    preferences:       Dict[str, Any]            = Field(default_factory=dict)


class UserProfileUpdate(BaseModel):
    name:              Optional[str]             = None
    goal:              Optional[str]             = None
    experience:        Optional[str]             = None
    currentLifts:      Optional[Dict[str, float]] = None
    liftUnit:          Optional[str]             = None
    bodyweight:        Optional[float]           = None
    trainingDays:      Optional[int]             = None
    injuries:          Optional[List[str]]       = None
    gymTypes:          Optional[List[str]]       = None
    equipmentAccess:   Optional[List[str]]       = None
    competitionDates:  Optional[List[str]]       = None
    preferences:       Optional[Dict[str, Any]]  = None
    onboardingComplete: Optional[bool]           = None


# ─── 2. Intake (onboarding) ───────────────────────────────────────────────────

class IntakeRequest(BaseModel):
    """Body sent by onboarding intake screen."""
    name:             str
    goal:             str
    experience:       str
    squat:            float = 0.0
    bench:            float = 0.0
    deadlift:         float = 0.0
    ohp:              float = 0.0
    log:              float = 0.0
    axle:             float = 0.0
    yoke:             float = 0.0
    farmers:          float = 0.0
    liftUnit:         str   = "lbs"
    bodyweight:       float = 200.0
    trainingDays:     int   = 4
    injuries:         List[str] = Field(default_factory=list)
    gymTypes:         List[str] = Field(default_factory=list)
    equipmentAccess:  List[str] = Field(default_factory=list)
    competitionDates: List[str] = Field(default_factory=list)
    secondaryGoal:    Optional[str] = None
    programStartDate: Optional[str] = None


# ─── 3. Plan hierarchy ───────────────────────────────────────────────────────

class TargetSet(BaseModel):
    setNumber:   int
    targetLoad:  float         = 0.0
    loadUnit:    str           = "lbs"
    targetReps:  int           = 1
    targetRPE:   float         = 8.0
    isAmrap:     bool          = False
    notes:       Optional[str] = None


class SessionExercise(BaseModel):
    exerciseId:        str
    name:              str
    category:          str           = "main"   # main/supplemental/accessory/prehab/gpp
    prescription:      str           = ""
    targetSets:        List[TargetSet] = Field(default_factory=list)
    order:             int           = 0
    notes:             Optional[str] = None
    adjustedFrom:      Optional[str] = None
    adjustmentReason:  Optional[str] = None


class PlanSession(BaseModel):
    sessionId:    str
    planId:       str
    weekNumber:   int
    dayNumber:    int   # 1=Mon, 2=Tue…7=Sun
    sessionType:  str   # ME Lower / ME Upper / DE Lower / DE Upper / GPP / Off
    objective:    str   = ""
    coachNote:    str   = ""
    warmup:       str   = ""
    exercises:    List[SessionExercise] = Field(default_factory=list)
    status:       str   = "planned"   # planned/inProgress/completed/skipped
    startedAt:    Optional[datetime] = None
    completedAt:  Optional[datetime] = None
    createdAt:    datetime = Field(default_factory=_now)


class Block(BaseModel):
    blockId:         str
    planId:          str
    phaseId:         str
    blockName:       str
    blockNumber:     int
    blockGoal:       str        = ""
    startWeek:       int
    endWeek:         int
    weekCount:       int
    isDeload:        bool       = False
    progressionLogic: str       = ""
    riskAreas:       List[str]  = Field(default_factory=list)
    keyExercises:    List[str]  = Field(default_factory=list)
    status:          str        = "upcoming"  # upcoming/current/completed


class Phase(BaseModel):
    phaseId:             str
    planId:              str
    phaseName:           str
    phaseNumber:         int
    goal:                str   = ""
    expectedAdaptation:  str   = ""
    startWeek:           int
    endWeek:             int
    blocks:              List[Block] = Field(default_factory=list)
    status:              str   = "upcoming"  # upcoming/current/completed


class AnnualPlan(BaseModel):
    planId:        str
    userId:        str
    planName:      str
    trainingModel: str        = "the_program"
    startDate:     str
    totalWeeks:    int        = 52
    phases:        List[Phase] = Field(default_factory=list)
    deloadWeeks:   List[int]  = Field(default_factory=list)
    testingWeeks:  List[int]  = Field(default_factory=list)
    milestones:    List[Dict] = Field(default_factory=list)
    status:        str        = "active"   # active/completed/archived
    generatedAt:   datetime   = Field(default_factory=_now)
    lastModified:  datetime   = Field(default_factory=_now)


# ─── 4. Exercise ─────────────────────────────────────────────────────────────

class ExerciseAlternative(BaseModel):
    name:   str
    reason: str


class Exercise(BaseModel):
    exerciseId:        str
    name:              str
    movementPattern:   str              # push/pull/hinge/squat/carry/isolation
    category:          str              # main/supplemental/accessory/gpp/prehab
    primaryMuscles:    List[str]        = Field(default_factory=list)
    secondaryMuscles:  List[str]        = Field(default_factory=list)
    equipment:         List[str]        = Field(default_factory=list)
    jointStressTags:   List[str]        = Field(default_factory=list)
    contraindications: List[str]        = Field(default_factory=list)
    indoorOutdoor:     str              = "indoor"
    skillLevel:        str              = "intermediate"
    cues:              List[str]        = Field(default_factory=list)
    commonMistakes:    List[str]        = Field(default_factory=list)
    alternatives:      Dict[str, List[ExerciseAlternative]] = Field(default_factory=dict)


# ─── 5. LoggedSet ────────────────────────────────────────────────────────────

class LoggedSetCreate(BaseModel):
    sessionId:         str
    sessionExerciseId: str
    exerciseName:      str
    setNumber:         int
    targetLoad:        float          = 0.0
    actualLoad:        float          = 0.0
    loadUnit:          str            = "lbs"
    targetReps:        int            = 1
    actualReps:        int            = 0
    targetRPE:         float          = 8.0
    actualRPE:         float          = 0.0
    painScore:         int            = 0   # 0-4
    painLocation:      Optional[str]  = None
    painNote:          Optional[str]  = None
    modified:          bool           = False
    skipped:           bool           = False
    substitutionReason: Optional[str] = None


class LoggedSet(LoggedSetCreate):
    setId:     Optional[str] = None
    timestamp: datetime      = Field(default_factory=_now)
    e1rm:      float         = 0.0


# ─── 6. WorkoutLog ───────────────────────────────────────────────────────────

class WorkoutLog(BaseModel):
    logId:           Optional[str]  = None
    userId:          str            = "default"
    sessionId:       str
    completedSets:   int            = 0
    totalSets:       int            = 0
    durationMinutes: int            = 0
    completedAt:     datetime       = Field(default_factory=_now)
    wins:            List[str]      = Field(default_factory=list)
    flags:           List[str]      = Field(default_factory=list)
    coachReviewNote: Optional[str]  = None
    topLoads:        Dict[str, float] = Field(default_factory=dict)


# ─── 7. PainEntry ────────────────────────────────────────────────────────────

class PainEntryCreate(BaseModel):
    exerciseName:  str
    sessionId:     Optional[str] = None
    location:      str           # body part e.g. "right knee"
    score:         int           # 0-4
    painType:      str           = "ache"  # ache/sharp/joint/muscle
    isNew:         bool          = False
    note:          Optional[str] = None


class PainEntry(PainEntryCreate):
    entryId:   Optional[str] = None
    userId:    str           = "default"
    timestamp: datetime      = Field(default_factory=_now)


# ─── 8. CoachMemoryFact ──────────────────────────────────────────────────────

class CoachMemoryFact(BaseModel):
    factId:       Optional[str] = None
    userId:       str           = "default"
    factType:     str           # injury/preference/goal/pr/weakness
    factValue:    str
    confidence:   float         = 1.0
    source:       str           = "onboarding"  # onboarding/upload/chat/log/pain
    confirmed:    bool          = True
    lastUsedDate: Optional[datetime] = None
    createdAt:    datetime      = Field(default_factory=_now)


# ─── 9. ProgramChange ────────────────────────────────────────────────────────

class ProgramChange(BaseModel):
    changeId:           Optional[str] = None
    userId:             str           = "default"
    timestamp:          datetime      = Field(default_factory=_now)
    triggerType:        str           # pain/readiness/missedSession/upload/chat/performance
    scope:              str           # day/block/year
    oldValue:           str           = ""
    newValue:           str           = ""
    explanation:        str           = ""
    userVisible:        bool          = True
    affectedSessionIds: List[str]     = Field(default_factory=list)


# ─── 10. ProgressMetric ──────────────────────────────────────────────────────

class ProgressMetric(BaseModel):
    metricId:   Optional[str] = None
    userId:     str           = "default"
    exerciseId: Optional[str] = None
    metricType: str           # pr/e1rm/volume/compliance/bodyweight
    value:      float
    unit:       str           = "lbs"
    date:       str
    weekNumber: Optional[int] = None
