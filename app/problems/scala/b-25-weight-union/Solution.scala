def weight(x: Int | String): Int = x match
  case n: Int    => n
  case s: String => s.length
