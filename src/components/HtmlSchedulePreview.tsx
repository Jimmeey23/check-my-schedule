import React, { useState, useEffect } from "react";
import type { WeekSchedule } from "@/types/schedule";
import { format } from "date-fns";

interface HtmlSchedulePreviewProps {
  schedule: WeekSchedule | null;
  onScheduleUpdate?: (updatedSchedule: WeekSchedule) => void;
}

export const HtmlSchedulePreview: React.FC<HtmlSchedulePreviewProps> = ({
  schedule,
  onScheduleUpdate,
}) => {
  const [editableSchedule, setEditableSchedule] = useState<WeekSchedule | null>(schedule);

  useEffect(() => {
    setEditableSchedule(schedule);
  }, [schedule]);

  const handleCellEdit = (
    dayIndex: number,
    classIndex: number,
    field: "time" | "className" | "trainer",
    value: string
  ) => {
    if (!editableSchedule) return;

    const updatedSchedule = { ...editableSchedule };
    const day = updatedSchedule.days[dayIndex];
    if (day && day.classes[classIndex]) {
      day.classes[classIndex][field] = value;
      setEditableSchedule(updatedSchedule);
      onScheduleUpdate?.(updatedSchedule);
    }
  };

  if (!editableSchedule) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">No schedule data available</p>
      </div>
    );
  }

  const startDate = editableSchedule.weekStart ? new Date(editableSchedule.weekStart) : new Date();
  const endDate = editableSchedule.weekEnd ? new Date(editableSchedule.weekEnd) : new Date();

  return (
    <div className="html-schedule-preview">
      <style>{`
        .html-schedule-preview {
          font-family: 'Montserrat', sans-serif;
          background: white;
          padding: 40px;
          max-width: 1200px;
          margin: 0 auto;
        }

        .schedule-header {
          margin-bottom: 40px;
        }

        .schedule-title {
          font-family: 'Agrandir', sans-serif;
          font-size: 49px;
          font-weight: 800;
          color: #2C2D2D;
          letter-spacing: -0.5px;
          margin-bottom: 10px;
        }

        .schedule-daterange {
          font-family: 'Cormorant Garamond', serif;
          font-size: 42px;
          font-style: italic;
          font-weight: 700;
          color: #000000;
          letter-spacing: -0.5px;
        }

        .schedule-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 20px;
          margin-top: 40px;
        }

        .day-column {
          background: #F8F8F8;
          border-radius: 8px;
          padding: 15px;
        }

        .day-header {
          font-family: 'Montserrat', sans-serif;
          font-size: 17px;
          font-weight: 600;
          color: #2C2D2D;
          text-align: center;
          margin-bottom: 15px;
          padding-bottom: 10px;
          border-bottom: 2px solid #2C2D2D;
        }

        .class-card {
          background: white;
          border-radius: 6px;
          padding: 12px;
          margin-bottom: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          transition: box-shadow 0.2s;
        }

        .class-card:hover {
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }

        .class-time {
          font-size: 13px;
          font-weight: 700;
          color: #000000;
          display: inline-block;
          width: 75px;
          text-align: left;
          margin-bottom: 6px;
          padding: 2px 4px;
          border-radius: 3px;
        }

        .class-time:focus {
          outline: 2px solid #4A90E2;
          background: #F0F7FF;
        }

        .class-name {
          font-size: 13px;
          font-weight: 600;
          color: #2C2D2D;
          margin-bottom: 4px;
          padding: 2px 4px;
          border-radius: 3px;
        }

        .class-name:focus {
          outline: 2px solid #4A90E2;
          background: #F0F7FF;
        }

        .class-trainer {
          font-size: 11px;
          color: #666;
          padding: 2px 4px;
          border-radius: 3px;
        }

        .class-trainer:focus {
          outline: 2px solid #4A90E2;
          background: #F0F7FF;
        }

        .theme-badge {
          display: inline-block;
          padding: 3px 8px;
          border-radius: 12px;
          font-size: 9px;
          font-weight: 700;
          color: #F4F6E3;
          background: linear-gradient(135deg, #7DC579 0%, #5A9F56 100%);
          margin-top: 6px;
        }

        .sold-out {
          text-decoration: line-through;
          opacity: 0.6;
        }

        [contenteditable="true"] {
          cursor: text;
        }

        [contenteditable="true"]:hover {
          background: #FAFAFA;
        }
      `}</style>

      <div className="schedule-header">
        <div className="schedule-title">STUDIO SCHEDULE</div>
        <div className="schedule-daterange">
          {format(startDate, "MMMM do")} - {format(endDate, "MMMM do")}
        </div>
      </div>

      <div className="schedule-grid">
        {editableSchedule.days.map((day, dayIndex) => (
          <div key={dayIndex} className="day-column">
            <div className="day-header">{day.day}</div>
            {day.classes.map((classItem, classIndex) => (
              <div key={classIndex} className="class-card">
                <div
                  className="class-time"
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) =>
                    handleCellEdit(dayIndex, classIndex, "time", e.currentTarget.textContent || "")
                  }
                >
                  {classItem.time}
                </div>
                <div
                  className="class-name"
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) =>
                    handleCellEdit(dayIndex, classIndex, "className", e.currentTarget.textContent || "")
                  }
                >
                  {classItem.className}
                </div>
                {classItem.trainer && (
                  <div
                    className="class-trainer"
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) =>
                      handleCellEdit(dayIndex, classIndex, "trainer", e.currentTarget.textContent || "")
                    }
                  >
                    {classItem.trainer}
                  </div>
                )}
                {classItem.theme && (
                  <div className="theme-badge">{classItem.theme}</div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
