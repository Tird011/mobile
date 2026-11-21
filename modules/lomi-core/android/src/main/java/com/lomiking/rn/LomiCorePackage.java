package com.lomiking.rn;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import com.facebook.react.BaseReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.module.model.ReactModuleInfo;
import com.facebook.react.module.model.ReactModuleInfoProvider;
import java.util.HashMap;
import java.util.Map;

/** Registers LomiCoreModule with React Native (found by autolinking). */
public class LomiCorePackage extends BaseReactPackage {
    @Nullable @Override
    public NativeModule getModule(@NonNull String name, @NonNull ReactApplicationContext context) {
        return LomiCoreModule.NAME.equals(name) ? new LomiCoreModule(context) : null;
    }

    @NonNull @Override
    public ReactModuleInfoProvider getReactModuleInfoProvider() {
        return () -> {
            Map<String, ReactModuleInfo> map = new HashMap<>();
            map.put(LomiCoreModule.NAME, new ReactModuleInfo(LomiCoreModule.NAME, LomiCoreModule.class.getName(),
                    false, false, false, true));
            return map;
        };
    }
}
