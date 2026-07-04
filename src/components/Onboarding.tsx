import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, MapPin, Play, Volume2 } from "lucide-react";
import type { AppConfig } from "@/types/config";
import { MosqueIcon } from "./icons/Mosque";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
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

const STEPS = ["Selamat datang", "Lokasi", "Audio", "Selesai"];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [locationMode, setLocationMode] = useState<"Auto" | "ManualCity">("Auto");
  const [cityQuery, setCityQuery] = useState("");
  const [cityResults, setCityResults] = useState<City[]>([]);
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [volume, setVolume] = useState(70);
  const [muted, setMuted] = useState(false);
  const [searching, setSearching] = useState(false);

  const searchCities = useCallback(async (q: string) => {
    setCityQuery(q);
    if (q.length < 2) {
      setCityResults([]);
      return;
    }
    setSearching(true);
    try {
      const results = await invoke<City[]>("search_cities", { query: q });
      setCityResults(results.slice(0, 10));
    } catch {
      setCityResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const testSound = async () => {
    await invoke("test_sound");
  };

  const finish = async () => {
    const cfg: AppConfig = {
      onboarding_done: true,
      location_mode: locationMode,
      city_id: selectedCity?.id ?? "eda80a3d5b344bc40f3bc04f65b7a357",
      city_name: selectedCity?.lokasi ?? "JAKARTA",
      timezone: "Asia/Jakarta",
      last_lat_long: null,
      volume: volume / 100,
      muted,
      reminder_offset_minutes: -5,
      auto_launch: true,
    };
    await invoke("complete_onboarding", { config: cfg });
    onDone();
  };

  return (
    <div className="glass flex min-h-full w-full flex-col overflow-hidden rounded-xl animate-popup-enter">
      <header className="border-b border-border/40 px-6 py-5 text-center">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <MosqueIcon className="size-6" />
        </div>
        <p className="font-display text-xl font-semibold tracking-tight">Sholat Widget</p>
        <p className="mt-1 text-sm text-muted-foreground">Setup awal widget</p>
      </header>

      <div className="flex justify-center gap-2 px-6 py-4">
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-col items-center gap-1">
            <div
              className={cn(
                "flex size-8 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                i < step && "bg-emerald-600 text-white",
                i === step && "bg-primary text-primary-foreground",
                i > step && "bg-muted text-muted-foreground"
              )}
            >
              {i < step ? <Check className="size-3.5" /> : i + 1}
            </div>
            <span className="hidden text-[10px] text-muted-foreground sm:block">{label}</span>
          </div>
        ))}
      </div>

      <Separator />

      <div className="flex flex-1 flex-col gap-4 px-6 py-5">
        {step === 0 && (
          <Card className="border-0 bg-transparent shadow-none">
            <CardHeader className="px-0">
              <CardTitle className="font-display text-lg">Selamat datang</CardTitle>
              <CardDescription>
                Anda akan diberi tahu 5 menit sebelum setiap waktu sholat dengan
                notifikasi dan suara bedug.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <Button className="w-full" onClick={() => setStep(1)}>
                Lanjut
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 1 && (
          <FieldGroup>
            <FieldSet>
              <FieldLegend>Pilih lokasi</FieldLegend>
              <RadioGroup
                value={locationMode}
                onValueChange={(v) => setLocationMode(v as "Auto" | "ManualCity")}
                className="flex flex-col gap-3"
              >
                <Field orientation="horizontal">
                  <RadioGroupItem value="Auto" id="onb-auto" />
                  <Label htmlFor="onb-auto" className="font-normal">
                    Deteksi otomatis (GPS/IP)
                  </Label>
                </Field>
                <Field orientation="horizontal">
                  <RadioGroupItem value="ManualCity" id="onb-manual" />
                  <Label htmlFor="onb-manual" className="font-normal">
                    Pilih kota manual
                  </Label>
                </Field>
              </RadioGroup>
            </FieldSet>

            {locationMode === "ManualCity" && (
              <Field>
                <FieldLabel>Cari kota</FieldLabel>
                <Command className="rounded-lg border border-border" shouldFilter={false}>
                  <CommandInput
                    placeholder="Ketik nama kota..."
                    value={cityQuery}
                    onValueChange={searchCities}
                  />
                  <CommandList>
                    {searching && (
                      <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                        <Spinner className="size-4" />
                        Mencari...
                      </div>
                    )}
                    <CommandEmpty>
                      {cityQuery.length < 2
                        ? "Ketik minimal 2 huruf"
                        : "Kota tidak ditemukan"}
                    </CommandEmpty>
                    <CommandGroup heading="Hasil pencarian">
                      {cityResults.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={c.lokasi}
                          onSelect={() => setSelectedCity(c)}
                          data-checked={selectedCity?.id === c.id}
                        >
                          <MapPin data-icon="inline-start" />
                          {c.lokasi}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
                {selectedCity && (
                  <p className="text-xs text-muted-foreground">
                    Terpilih:{" "}
                    <span className="font-medium text-foreground">
                      {selectedCity.lokasi}
                    </span>
                  </p>
                )}
              </Field>
            )}

            <Button className="w-full" onClick={() => setStep(2)}>
              Lanjut
            </Button>
          </FieldGroup>
        )}

        {step === 2 && (
          <FieldGroup>
            <Field>
              <div className="flex items-center justify-between">
                <FieldLabel className="flex items-center gap-2">
                  <Volume2 className="size-4" />
                  Volume bedug
                </FieldLabel>
                <span className="font-mono text-sm tabular-nums text-muted-foreground">
                  {volume}%
                </span>
              </div>
              <Slider
                value={[volume]}
                min={0}
                max={100}
                step={1}
                onValueChange={(v) => {
                  const values = Array.isArray(v) ? v : [v];
                  setVolume(values[0]);
                }}
                aria-label="Volume bedug"
              />
            </Field>

            <Button variant="outline" onClick={testSound} className="w-full">
              <Play data-icon="inline-start" />
              Test bunyi
            </Button>

            <Field orientation="horizontal">
              <FieldLabel>Bisukan notifikasi</FieldLabel>
              <Switch checked={muted} onCheckedChange={setMuted} aria-label="Bisukan" />
            </Field>

            <Button className="w-full" onClick={() => setStep(3)}>
              Lanjut
            </Button>
          </FieldGroup>
        )}

        {step === 3 && (
          <Card className="border-0 bg-transparent shadow-none">
            <CardHeader className="px-0 text-center">
              <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-emerald-600/10 text-emerald-600">
                <Check className="size-5" />
              </div>
              <CardTitle className="font-display text-lg">Selesai</CardTitle>
              <CardDescription>
                Pengingat aktif. Anda akan diberi tahu 5 menit sebelum sholat.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <Button className="w-full" onClick={finish}>
                Mulai
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}