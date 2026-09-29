// 자동 생성 (tools/art/board_lines.py). 정거장 전광판의 기분 노선 이름.
import type { Box } from './station-art';

export const LINE_BOARD: Record<string, { src: number; box: Box }> = {
  field: { src: require('@/assets/station/board_line_field.webp'), box: { x: 1011, y: 866, w: 232, h: 167 } },
  rain: { src: require('@/assets/station/board_line_rain.webp'), box: { x: 985, y: 860, w: 284, h: 180 } },
  thunder: { src: require('@/assets/station/board_line_thunder.webp'), box: { x: 1012, y: 866, w: 231, h: 168 } },
  blanket: { src: require('@/assets/station/board_line_blanket.webp'), box: { x: 1012, y: 866, w: 229, h: 168 } },
  drift: { src: require('@/assets/station/board_line_drift.webp'), box: { x: 984, y: 860, w: 285, h: 181 } },
  pick: { src: require('@/assets/station/board_line_pick.webp'), box: { x: 958, y: 864, w: 337, h: 172 } },
};
