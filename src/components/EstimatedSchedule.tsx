// @ts-nocheck
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Clock, Calendar } from 'lucide-react';

interface ScheduleItem {
  time: string;
  title: string;
  episode: string;
  animeId: string;
}

export function EstimatedSchedule() {
  const [selectedDay, setSelectedDay] = useState<string>('FRI');

  const days = [
    { label: 'MON', date: '29', key: 'MON' },
    { label: 'TUE', date: '30', key: 'TUE' },
    { label: 'WED', date: '1', key: 'WED' },
    { label: 'THU', date: '2', key: 'THU' },
    { label: 'FRI', date: '3', key: 'FRI', isToday: true },
    { label: 'SAT', date: '4', key: 'SAT' },
    { label: 'SUN', date: '5', key: 'SUN' },
  ];

  const schedules: Record<string, ScheduleItem[]> = {
    THU: [
      { time: '03:00 AM', title: 'Jujutsu Kaisen', episode: 'EP 14', animeId: '5' },
      { time: '05:00 AM', title: 'Demon Slayer: Kimetsu no Yaiba', episode: 'EP 3', animeId: '4' },
      { time: '08:30 AM', title: 'Dandadan', episode: 'EP 1', animeId: '10' },
      { time: '11:00 PM', title: 'Sakamoto Days', episode: 'EP 2', animeId: '9' },
    ],
    FRI: [
      { time: '12:00 AM', title: 'Crowned in a Hundred Days', episode: 'EP 1', animeId: '15' },
      { time: '12:01 AM', title: 'Crowned in a Hundred Days', episode: 'EP 2', animeId: '15' },
      { time: '12:02 AM', title: 'Crowned in a Hundred Days', episode: 'EP 3', animeId: '15' },
      { time: '12:03 AM', title: 'Crowned in a Hundred Days', episode: 'EP 4', animeId: '15' },
      { time: '05:55 AM', title: 'Pokémon Horizons: The Series', episode: 'EP 142', animeId: '16' },
      { time: '09:30 AM', title: 'I Became a Legend After My 10 Years in the Noob Academy', episode: 'EP 1', animeId: '17' },
    ],
    SAT: [
      { time: '01:00 AM', title: 'Solo Leveling', episode: 'EP 12', animeId: '6' },
      { time: '06:30 AM', title: 'One Piece', episode: 'EP 1105', animeId: '1' },
      { time: '09:00 AM', title: 'Bleach', episode: 'EP 26', animeId: '12' },
      { time: '10:00 PM', title: 'Chainsaw Man', episode: 'EP 6', animeId: '7' },
    ],
    SUN: [
      { time: '02:00 AM', title: 'Frieren: Beyond Journey\'s End', episode: 'EP 28', animeId: '8' },
      { time: '07:00 AM', title: 'Attack on Titan', episode: 'EP 15', animeId: '3' },
      { time: '11:30 AM', title: 'Black Clover', episode: 'EP 171', animeId: '13' },
    ],
    MON: [
      { time: '04:00 AM', title: 'Overflow', episode: 'EP 1', animeId: '11' },
      { time: '09:00 AM', title: 'Witch Hat Atelier', episode: 'EP 2', animeId: '14' },
    ],
    TUE: [
      { time: '03:15 AM', title: 'Demon Slayer: Kimetsu no Yaiba', episode: 'EP 4', animeId: '4' },
      { time: '08:00 AM', title: 'One Piece', episode: 'EP 1106', animeId: '1' },
    ],
    WED: [
      { time: '05:30 AM', title: 'Dandadan', episode: 'EP 2', animeId: '10' },
      { time: '10:45 PM', title: 'Solo Leveling', episode: 'EP 13', animeId: '6' },
    ],
  };

  const currentItems = schedules[selectedDay] || [];

  const handlePrevDay = () => {
    const currentIndex = days.findIndex(d => d.key === selectedDay);
    const prevIndex = (currentIndex - 1 + days.length) % days.length;
    setSelectedDay(days[prevIndex].key);
  };

  const handleNextDay = () => {
    const currentIndex = days.findIndex(d => d.key === selectedDay);
    const nextIndex = (currentIndex + 1) % days.length;
    setSelectedDay(days[nextIndex].key);
  };

  return (
    <div className="w-full bg-[#050c18]/40 border border-white/5 rounded-3xl p-6 md:p-8 backdrop-blur-md shadow-2xl mt-12 mb-16">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-xl border border-primary/20 text-primary">
            <Calendar size={20} />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">Estimated Schedule</h2>
            <p className="text-xs text-gray-400 mt-0.5">Showing broadcasting release times (Local Time)</p>
          </div>
        </div>

        {/* Day Selector Navigation Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevDay}
            className="p-2.5 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white rounded-xl border border-white/5 transition-all active:scale-95 cursor-pointer"
            aria-label="Previous Day"
          >
            <ChevronLeft size={18} />
          </button>
          
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1">
            {days.map((day) => {
              const isSelected = selectedDay === day.key;
              return (
                <button
                  key={day.key}
                  onClick={() => setSelectedDay(day.key)}
                  className={`flex flex-col items-center justify-center min-w-[56px] py-2 px-2.5 rounded-xl border transition-all active:scale-95 cursor-pointer ${
                    isSelected
                      ? 'bg-primary text-black font-black border-primary shadow-[0_0_15px_rgba(0,229,255,0.25)]'
                      : day.isToday
                      ? 'bg-primary/10 text-primary border-primary/20 font-bold'
                      : 'bg-[#0a101d] text-gray-400 border-white/5 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span className="text-[10px] uppercase font-bold tracking-wider">{day.label}</span>
                  <span className="text-sm font-extrabold mt-0.5">{day.date}</span>
                </button>
              );
            })}
          </div>

          <button
            onClick={handleNextDay}
            className="p-2.5 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white rounded-xl border border-white/5 transition-all active:scale-95 cursor-pointer"
            aria-label="Next Day"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Broadcasting Timeline Schedule list */}
      <div className="relative border-l border-white/10 ml-6 pl-8 py-2 space-y-6">
        {currentItems.length > 0 ? (
          currentItems.map((item, index) => (
            <Link
              key={index}
              to={`/anime/${item.animeId}`}
              className="group relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-[#0a101d]/60 hover:bg-primary/5 border border-transparent hover:border-primary/20 rounded-2xl transition-all duration-300"
            >
              {/* Timeline Bullet Indicator */}
              <div className="absolute -left-[41px] top-1/2 -translate-y-1/2 w-4.5 h-4.5 rounded-full bg-[#050c18] border-2 border-white/20 group-hover:border-primary transition-all flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-gray-500 group-hover:bg-primary transition-all" />
              </div>

              {/* Time and Title info */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-xs font-mono text-gray-400 group-hover:text-primary transition-colors min-w-[80px]">
                  <Clock size={12} />
                  <span>{item.time}</span>
                </div>
                <div className="font-semibold text-white group-hover:text-primary transition-colors text-sm sm:text-base">
                  {item.title}
                </div>
              </div>

              {/* Episode badge indicator */}
              <div className="flex items-center">
                <span className="text-xs bg-[#00e5ff]/10 text-primary border border-primary/20 font-bold px-2.5 py-1 rounded-lg uppercase tracking-wide">
                  {item.episode}
                </span>
              </div>
            </Link>
          ))
        ) : (
          <div className="text-center py-8 text-gray-500">
            No broadcasting releases estimated for this day.
          </div>
        )}
      </div>
    </div>
  );
}
