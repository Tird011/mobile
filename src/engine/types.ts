// Shapes of the JSON the Java core sends back (see core/.../bridge/SnapshotBuilder.java).

export type SceneId = 'MENU' | 'COUNTER' | 'KITCHEN' | 'MAIN_DINER' | 'DELIVERY_HUB';
export type GameState = 'MENU' | 'PLAYING' | 'PAUSED' | 'DAY_OVER';
export type InputType = 'TAP' | 'SWIPE' | 'CIRCLE' | 'HOLD' | 'MIC_LEVEL' | 'DRAG_DROP' | 'CONFIRM';
export type Emotion = 'DELIGHTED' | 'HAPPY' | 'NEUTRAL' | 'IMPATIENT' | 'ANGRY';
export type EmoteName = 'HAPPY_MASKED' | 'HAPPY' | 'BLOW' | 'LAUGH' | 'SHOCKED' | 'NERVOUS' | 'UH_OH';

export interface CustomerView {
  id: string; name: string; type: string; model: string;
  action: 'ARRIVING' | 'IN_LINE' | 'WAITING_FOR_FOOD' | 'EATING' | 'PAYING' | 'LEFT' | 'LEFT_ANGRY';
  emotion: Emotion; patience: number; remote: boolean; tableId: number; orderId: string | null; say: string;
  stars?: number; comment?: string;
}
export interface OrderLineView { dish: string; extras: string[]; cooking: boolean; cooked: boolean; quality?: number; stars?: number }
export interface OrderView {
  id: string; customerId: string; status: 'PENDING' | 'COOKING' | 'READY' | 'OUT_FOR_DELIVERY' | 'SERVED' | 'DELIVERED' | 'CANCELLED';
  delivery: boolean; summary: string; price: number; lines: OrderLineView[];
}
export interface StepView {
  step: string; title: string; hint: string; gesture: InputType; progress: number; mistakes: number;
  [extra: string]: unknown;
}
export interface CookingView { orderId: string; dish: string; stepIndex: number; stepCount: number; step: StepView }
export interface TaskView {
  id: string; type: string; title: string; sector: 'COUNTER' | 'KITCHEN' | 'MAIN_DINER' | 'DELIVERY_HUB';
  status: 'POSTED' | 'ACTIVE' | 'DONE' | 'EXPIRED'; interactive: boolean; progress: number; timeLeft: number; reward: number;
  tableId?: number; orderId?: string; ingredientId?: string; [extra: string]: unknown;
}
export interface TableView { id: number; occupant: string | null; dirt: number }
export interface DeliveryView {
  orderId: string; lane: number; distance: number; length: number; condition: number; warmth: number; finished: boolean;
  obstacles: { type: string; lane: number; ahead: number }[];
}
export interface ReportView {
  day: number; served: number; angry: number; deliveries: number; deliveriesFailed: number; dishesCooked: number;
  tasksDone: number; revenue: number; tips: number; spent: number; profit: number; avgRating: number;
}
export interface Snapshot {
  state: GameState; day: number; time: number; dayLength: number; closed: boolean; money: number; reputation: number;
  scene: { id: SceneId; environment: string; exits: SceneId[]; activeTask?: string; delivering?: boolean };
  kaloy: { emote: EmoteName; atlasCol: number; atlasRow: number };
  customers: CustomerView[]; orders: OrderView[]; cooking: CookingView | null; tasks: TaskView[];
  shop: { tables: TableView[]; dirtyDishes: number; floorDirt: number };
  inventory: Record<string, number>; delivery: DeliveryView | null; report: ReportView;
}
export interface GameEvent { type: string; t: number; [k: string]: unknown }
export interface CommandResult { cmd?: string; ok: boolean; message: string }
export interface StepResult { results: CommandResult[]; events: GameEvent[]; snapshot: Snapshot }

export interface DishInfo { id: string; name: string; price: number; category: string; ingredients: string[]; extras: string[] }
export interface IngredientInfo { id: string; name: string; category: string; prep: string; cost: number }
export interface Catalog { menu: DishInfo[]; ingredients: IngredientInfo[] }

export type Command =
  | { cmd: 'start' } | { cmd: 'pause' } | { cmd: 'resume' } | { cmd: 'nextDay' }
  | { cmd: 'goTo'; scene: SceneId }
  | { cmd: 'takeOrder'; customerId?: string }
  | { cmd: 'serve'; orderId?: string }
  | { cmd: 'cook'; orderId?: string }
  | { cmd: 'startTask'; taskId: string }
  | { cmd: 'buy'; ingredientId: string; qty: number }
  | { cmd: 'deliver'; orderId?: string }
  | { cmd: 'input'; type: InputType; value?: number; itemId?: string; dx?: number; dy?: number };
