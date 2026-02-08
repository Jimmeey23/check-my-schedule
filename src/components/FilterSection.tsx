import React, { useMemo } from 'react';
import { FilterState, ClassData } from '@/types/schedule';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface FilterSectionProps {
  data: {[day: string]: ClassData[]} | null;
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  isComparisonView?: boolean;
}

export function FilterSection({
  data,
  filters,
  onFilterChange,
  isComparisonView = false
}: FilterSectionProps) {
  // Extract unique values
  const { days, locations, trainers, classNames } = useMemo(() => {
    const daysSet = new Set<string>();
    const locationsSet = new Set<string>();
    const trainersSet = new Set<string>();
    const classNamesSet = new Set<string>();

    if (data) {
      Object.entries(data).forEach(([day, classes]) => {
        daysSet.add(day);
        classes.forEach(cls => {
          if (cls.location) locationsSet.add(cls.location);
          if (cls.trainer1) trainersSet.add(cls.trainer1);
          if (cls.className) classNamesSet.add(cls.className);
        });
      });
    }

    return {
      days: Array.from(daysSet).sort(),
      locations: Array.from(locationsSet).sort(),
      trainers: Array.from(trainersSet).sort(),
      classNames: Array.from(classNamesSet).sort(),
    };
  }, [data]);

  const toggleFilter = (key: 'day' | 'location' | 'trainer' | 'className', value: string) => {
    const current = filters[key] || [];
    const updated = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    
    onFilterChange({
      ...filters,
      [key]: updated
    });
  };

  const clearFilters = () => {
    onFilterChange({
      day: [],
      location: [],
      trainer: [],
      className: []
    });
  };

  return (
    <div className="space-y-4 p-4 bg-white border rounded-lg">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-slate-900">Filters</h3>
        <Button variant="outline" size="sm" onClick={clearFilters}>
          Clear All
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Days Filter */}
        <div>
          <Label className="text-sm font-medium text-slate-700 mb-2 block">Days</Label>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {days.map(day => (
              <div key={day} className="flex items-center gap-2">
                <Checkbox
                  id={`day-${day}`}
                  checked={filters.day.includes(day)}
                  onCheckedChange={() => toggleFilter('day', day)}
                />
                <Label htmlFor={`day-${day}`} className="text-xs cursor-pointer">{day}</Label>
              </div>
            ))}
          </div>
        </div>

        {/* Locations Filter */}
        <div>
          <Label className="text-sm font-medium text-slate-700 mb-2 block">Locations</Label>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {locations.map(location => (
              <div key={location} className="flex items-center gap-2">
                <Checkbox
                  id={`location-${location}`}
                  checked={filters.location.includes(location)}
                  onCheckedChange={() => toggleFilter('location', location)}
                />
                <Label htmlFor={`location-${location}`} className="text-xs cursor-pointer truncate">{location}</Label>
              </div>
            ))}
          </div>
        </div>

        {/* Trainers Filter */}
        <div>
          <Label className="text-sm font-medium text-slate-700 mb-2 block">Trainers</Label>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {trainers.map(trainer => (
              <div key={trainer} className="flex items-center gap-2">
                <Checkbox
                  id={`trainer-${trainer}`}
                  checked={filters.trainer.includes(trainer)}
                  onCheckedChange={() => toggleFilter('trainer', trainer)}
                />
                <Label htmlFor={`trainer-${trainer}`} className="text-xs cursor-pointer truncate">{trainer}</Label>
              </div>
            ))}
          </div>
        </div>

        {/* Class Names Filter */}
        <div>
          <Label className="text-sm font-medium text-slate-700 mb-2 block">Classes</Label>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {classNames.map(className => (
              <div key={className} className="flex items-center gap-2">
                <Checkbox
                  id={`class-${className}`}
                  checked={filters.className.includes(className)}
                  onCheckedChange={() => toggleFilter('className', className)}
                />
                <Label htmlFor={`class-${className}`} className="text-xs cursor-pointer truncate">{className}</Label>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
