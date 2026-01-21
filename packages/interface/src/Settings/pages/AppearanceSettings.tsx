import { useForm } from "react-hook-form";
import { useCoreQuery, useCoreMutation } from "../../contexts/SpacedriveContext";
import { useQueryClient } from "@tanstack/react-query";
import { applyTheme } from "../../hooks/useTheme";
import clsx from "clsx";

interface AppearanceSettingsForm {
  theme: string;
  language: string;
}

const THEMES = [
  { id: "system", name: "System" },
  { id: "light", name: "Light" },
  { id: "dark", name: "Dark" },
  { id: "midnight", name: "Midnight" },
  { id: "noir", name: "Noir" },
  { id: "slate", name: "Slate" },
  { id: "nord", name: "Nord" },
  { id: "mocha", name: "Mocha" },
] as const;

export function AppearanceSettings() {
  const queryClient = useQueryClient();
  const { data: config } = useCoreQuery({ type: "config.app.get", input: null as any });
  const updateConfig = useCoreMutation("config.app.update", {
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["config.app.get"] });
    },
  });

  const form = useForm<AppearanceSettingsForm>({
    values: {
      theme: config?.preferences?.theme || "system",
      language: config?.preferences?.language || "en",
    },
  });

  const handleThemeChange = async (themeId: string) => {
    form.setValue("theme", themeId);
    applyTheme(themeId);
    await updateConfig.mutateAsync({
      theme: themeId,
      language: form.getValues("language"),
    });
  };

  const onSubmit = form.handleSubmit(async (data) => {
    await updateConfig.mutateAsync({
      theme: data.theme,
      language: data.language,
    });
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-ink mb-2">Appearance</h2>
        <p className="text-sm text-ink-dull">
          Customize how Spacedrive looks.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="p-4 bg-app-box rounded-lg border border-app-line">
          <div className="mb-3">
            <span className="text-sm font-medium text-ink block">Theme</span>
            <p className="text-xs text-ink-dull mt-1">Choose your preferred color theme</p>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {THEMES.map((theme) => (
              <button
                key={theme.id}
                type="button"
                onClick={() => handleThemeChange(theme.id)}
                className={clsx(
                  "relative p-3 rounded-md transition-all text-left group",
                  form.watch("theme") === theme.id
                    ? "border-2 border-accent bg-accent/5"
                    : "border border-app-line bg-app-box hover:border-app-line/80"
                )}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="text-xs font-medium text-ink">{theme.name}</div>
                  {form.watch("theme") === theme.id && (
                    <div className="shrink-0 size-3 rounded-full bg-accent flex items-center justify-center">
                      <svg className="size-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </div>

                <div className="h-12 rounded border border-app-line overflow-hidden flex">
                  <div className={clsx(
                    "flex-1 flex flex-col gap-1 p-1.5",
                    theme.id === "light" && "bg-white",
                    theme.id === "dark" && "bg-[hsl(235,15%,13%)]",
                    theme.id === "midnight" && "bg-[hsl(240,30%,4%)]",
                    theme.id === "noir" && "bg-[hsl(0,0%,3%)]",
                    theme.id === "slate" && "bg-[hsl(220,8%,9%)]",
                    theme.id === "nord" && "bg-[hsl(220,18%,12%)]",
                    theme.id === "mocha" && "bg-[hsl(25,18%,10%)]"
                  )}>
                    <div className={clsx(
                      "h-1 w-3/4 rounded-sm",
                      theme.id === "light" ? "bg-gray-300" : "bg-gray-700"
                    )} />
                    <div className={clsx(
                      "h-1 w-1/2 rounded-sm",
                      theme.id === "light" ? "bg-gray-200" : "bg-gray-800"
                    )} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 bg-app-box rounded-lg border border-app-line">
          <label className="block">
            <span className="text-sm font-medium text-ink mb-1 block">Language</span>
            <p className="text-xs text-ink-dull mb-2">Select your preferred language</p>
            <select
              {...form.register("language")}
              className="w-full px-3 py-2 bg-app border border-app-line rounded-md text-ink text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="en">English</option>
              <option value="de">Deutsch</option>
              <option value="es">Español</option>
              <option value="fr">Français</option>
              <option value="it">Italiano</option>
              <option value="ja">日本語</option>
              <option value="ko">한국어</option>
              <option value="pt">Português</option>
              <option value="ru">Русский</option>
              <option value="zh">中文</option>
            </select>
          </label>
        </div>

        {form.formState.dirtyFields.language && (
          <button
            type="submit"
            disabled={updateConfig.isPending}
            className="px-4 py-2 bg-accent hover:bg-accent-deep text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50"
          >
            {updateConfig.isPending ? "Saving..." : "Save Changes"}
          </button>
        )}
      </form>
    </div>
  );
}
