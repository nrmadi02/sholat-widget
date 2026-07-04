import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { broadcastConfig } from "@/hooks/useConfig";
import { MapPin } from "lucide-react";
import type { AppConfig } from "@/types/config";
import { Button } from "@/components/ui/button";
import { FieldGroup, FieldSet, FieldLegend } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Spinner } from "@/components/ui/spinner";

interface City {
  id: string;
  lokasi: string;
}

export function LocationPicker({
  config,
  onSaved,
  onError,
}: {
  config: AppConfig;
  onSaved: (cfg: AppConfig) => void;
  onError?: (msg: string | null) => void;
}) {
  const [mode, setMode] = useState<"Auto" | "ManualCity">(config.location_mode);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<City[]>([]);
  const [selected, setSelected] = useState<City | null>({
    id: config.city_id,
    lokasi: config.city_name,
  });
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);

  const search = useCallback(async (q: string) => {
    setQuery(q);
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const r = await invoke<City[]>("search_cities", { query: q });
      setResults(r.slice(0, 10));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const save = async () => {
    setSaving(true);
    onError?.(null);
    const updated: AppConfig = {
      ...config,
      location_mode: mode,
      city_id: selected?.id ?? config.city_id,
      city_name: selected?.lokasi ?? config.city_name,
    };
    try {
      const saved = await invoke<AppConfig>("save_settings", { config: updated });
      onSaved(saved);
      void broadcastConfig(saved);
    } catch (err) {
      onError?.(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FieldGroup>
      <FieldSet>
        <FieldLegend>Mode lokasi</FieldLegend>
        <RadioGroup
          value={mode}
          onValueChange={(v) => setMode(v as "Auto" | "ManualCity")}
          className="flex flex-col gap-3"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="Auto" id="loc-auto" />
            <Label htmlFor="loc-auto" className="font-normal">
              Deteksi otomatis (GPS/IP)
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="ManualCity" id="loc-manual" />
            <Label htmlFor="loc-manual" className="font-normal">
              Pilih kota manual
            </Label>
          </div>
        </RadioGroup>
      </FieldSet>

      {mode === "ManualCity" && (
        <Command className="rounded-lg border border-border" shouldFilter={false}>
          <CommandInput
            placeholder="Cari kota..."
            value={query}
            onValueChange={search}
          />
          <CommandList>
            {searching && (
              <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                <Spinner className="size-4" />
                Mencari...
              </div>
            )}
            <CommandEmpty>
              {query.length < 2
                ? "Ketik minimal 2 huruf"
                : "Kota tidak ditemukan"}
            </CommandEmpty>
            <CommandGroup heading="Hasil pencarian">
              {results.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.lokasi}
                  onSelect={() => setSelected(c)}
                  data-checked={selected?.id === c.id}
                >
                  <MapPin data-icon="inline-start" />
                  {c.lokasi}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      )}

      {selected && mode === "ManualCity" && (
        <p className="text-xs text-muted-foreground">
          Terpilih: <span className="font-medium text-foreground">{selected.lokasi}</span>
        </p>
      )}

      <Button onClick={save} disabled={saving} className="w-full">
        {saving ? (
          <>
            <Spinner data-icon="inline-start" />
            Menyimpan...
          </>
        ) : (
          "Simpan lokasi"
        )}
      </Button>
    </FieldGroup>
  );
}