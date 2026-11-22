package com.lomiking.rn;

import androidx.annotation.NonNull;
import com.facebook.react.bridge.ReactApplicationContext;
import com.lomiking.core.bridge.GameBridge;
import com.lomiking.core.engine.GameConfig;

/**
 * Glue between React Native and the Java game core. All game rules live in core/;
 * this class only forwards JSON strings in and out (synchronous TurboModule calls).
 */
public class LomiCoreModule extends NativeLomiCoreSpec {
    public static final String NAME = "LomiCore";
    private GameBridge bridge = new GameBridge();

    public LomiCoreModule(ReactApplicationContext context) { super(context); }

    @NonNull @Override public String getName() { return NAME; }

    @Override public String step(double dt, String commandsJson) { return bridge.step(dt, commandsJson); }

    @Override public String catalog() { return bridge.catalog(); }

    @Override public String exportSave() { return bridge.exportSave(); }

    @Override public String importSave(String json) { return bridge.importSave(json); }

    @Override public void reset(double seed, double dayLength) {
        GameConfig cfg = GameConfig.defaults().seed((long) seed);
        if (dayLength > 0) cfg.dayLength(dayLength);
        bridge = new GameBridge(cfg);
    }
}
