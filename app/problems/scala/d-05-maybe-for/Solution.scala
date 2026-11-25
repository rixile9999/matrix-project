enum Maybe[+A]:
  case Just(value: A)
  case Empty

  def map[B](f: A => B): Maybe[B] = this match
    case Just(a) => Just(f(a))
    case Empty   => Empty

  def flatMap[B](f: A => Maybe[B]): Maybe[B] = this match
    case Just(a) => f(a)
    case Empty   => Empty

  def withFilter(p: A => Boolean): Maybe[A] = this match
    case Just(a) if p(a) => this
    case _               => Empty
