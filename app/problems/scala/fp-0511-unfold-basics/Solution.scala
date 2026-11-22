def fibsViaUnfold: Stream[Int] =
  unfold((0, 1)) { case (a, b) => Some((a, (b, a + b))) }

def fromViaUnfold(n: Int): Stream[Int] =
  unfold(n)(k => Some((k, k + 1)))

def constantViaUnfold[A](a: A): Stream[A] =
  unfold(a)(x => Some((x, x)))

def onesViaUnfold: Stream[Int] =
  constantViaUnfold(1)
