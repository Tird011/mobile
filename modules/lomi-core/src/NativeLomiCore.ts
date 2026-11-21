import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/** Codegen spec: the Java class LomiCoreModule implements these, synchronously. */
export interface Spec extends TurboModule {
  step(dt: number, commandsJson: string): string;
  catalog(): string;
  reset(seed: number, dayLength: number): void;
}

export default TurboModuleRegistry.get<Spec>('LomiCore');
